import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildChecksums, publishLatest, writeJson, writeText } from './artifacts.js';
import { runFreshCodex } from './codex.js';
import { extractCoveragePosts, fetchPressPage } from './coverage.js';
import { renderMarkdown } from './render.js';
import { parseAndValidateEditor, parseAndValidateResearch } from './validate.js';

function isoCompact(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function makeRunId() {
  return `${isoCompact(new Date())}-${crypto.randomBytes(4).toString('hex')}`;
}

function fillTemplate(template, replacements) {
  let output = template;
  for (const [marker, value] of Object.entries(replacements)) {
    const token = `{{${marker}}}`;
    if (!output.includes(token)) throw new Error(`Prompt template is missing ${token}`);
    output = output.replace(token, value);
  }
  return output;
}

function publicPosts(extracted) {
  return extracted.map(({ sourceHtml: _sourceHtml, ...post }, index) => ({
    position: index + 1,
    ...post
  }));
}

export async function generateLatest(config, logger = console) {
  const runId = makeRunId();
  const stagingRoot = path.join(config.artifactsDir, '.staging');
  const stagingDir = path.join(stagingRoot, runId);
  const failedDir = path.join(config.artifactsDir, 'failed', runId);
  const events = [];
  const event = (phase, details = {}) => {
    events.push({ at: new Date().toISOString(), phase, ...details });
    logger.log(`[press-scout] ${phase}`);
  };

  await fs.mkdir(stagingDir, { recursive: true });
  try {
    event('scrape_started');
    const fetched = await fetchPressPage(config);
    const extracted = extractCoveragePosts(fetched.html, fetched.finalUrl, config.maxArticles);
    if (extracted.length !== config.maxArticles) {
      throw new Error(`Expected ${config.maxArticles} unique coverage posts, found ${extracted.length}`);
    }
    const posts = publicPosts(extracted);
    await writeJson(path.join(stagingDir, 'inputs', 'posts.json'), posts);
    await writeText(
      path.join(stagingDir, 'inputs', 'coverage-posts.html'),
      `${extracted.map((post) => post.sourceHtml).join('\n')}\n`
    );
    for (let index = 0; index < extracted.length; index += 1) {
      await writeText(
        path.join(stagingDir, 'inputs', 'posts', `post-${String(index + 1).padStart(2, '0')}.html`),
        `${extracted[index].sourceHtml}\n`
      );
    }
    event('scrape_completed', { postCount: posts.length, finalUrl: fetched.finalUrl });

    const [researcherTemplate, editorTemplate] = await Promise.all([
      fs.readFile(path.join(config.rootDir, 'prompts', 'researcher.md'), 'utf8'),
      fs.readFile(path.join(config.rootDir, 'prompts', 'editor.md'), 'utf8')
    ]);
    const postsJson = JSON.stringify(posts, null, 2);
    const researcherPrompt = fillTemplate(researcherTemplate, { POSTS_JSON: postsJson });
    if (Buffer.byteLength(researcherPrompt) > config.maxAgentOutputBytes) {
      throw new Error('Researcher prompt exceeds the configured handoff limit');
    }
    await writeText(path.join(stagingDir, 'handoffs', 'researcher-prompt.md'), researcherPrompt);

    event('researcher_started', { freshSession: true, webSearch: true });
    const researchRaw = await runFreshCodex({
      rootDir: config.rootDir,
      workDir: stagingDir,
      prompt: researcherPrompt,
      schemaPath: path.join(config.rootDir, 'schemas', 'research.schema.json'),
      outputPath: path.join(stagingDir, 'research.raw.json'),
      timeoutMs: config.agentTimeoutMs,
      maxOutputBytes: config.maxAgentOutputBytes
    });
    const research = parseAndValidateResearch(researchRaw, posts);
    await writeJson(path.join(stagingDir, 'research.json'), research);
    event('researcher_completed', {
      candidateCount: research.sourcePosts.reduce((count, group) => count + group.candidates.length, 0)
    });

    const researchJson = JSON.stringify(research, null, 2);
    const editorPrompt = fillTemplate(editorTemplate, {
      POSTS_JSON: postsJson,
      RESEARCH_JSON: researchJson
    });
    if (Buffer.byteLength(editorPrompt) > config.maxAgentOutputBytes * 2) {
      throw new Error('Editor prompt exceeds the configured handoff limit');
    }
    await writeText(path.join(stagingDir, 'handoffs', 'editor-prompt.md'), editorPrompt);
    await writeJson(path.join(stagingDir, 'handoffs', 'editor-input.json'), { posts, research });

    event('editor_started', { freshSession: true, webSearch: true });
    const editorRaw = await runFreshCodex({
      rootDir: config.rootDir,
      workDir: stagingDir,
      prompt: editorPrompt,
      schemaPath: path.join(config.rootDir, 'schemas', 'editor.schema.json'),
      outputPath: path.join(stagingDir, 'editor-output.json'),
      timeoutMs: config.agentTimeoutMs,
      maxOutputBytes: config.maxAgentOutputBytes
    });
    const editor = parseAndValidateEditor(editorRaw, posts);
    await writeJson(path.join(stagingDir, 'validated.json'), editor.validated);
    await writeText(path.join(stagingDir, 'newsletter.md'), `${editor.newsletterMarkdown.trim()}\n`);
    const completedAt = new Date().toISOString();
    await writeText(path.join(stagingDir, 'newsletter.html'), renderMarkdown(editor.newsletterMarkdown));
    event('editor_completed', {
      acceptedCount: editor.validated.accepted.length,
      rejectedCount: editor.validated.rejected.length
    });
    event('run_completed');
    await writeJson(path.join(stagingDir, 'events.json'), events);

    const checksums = await buildChecksums(stagingDir);
    await writeJson(path.join(stagingDir, 'run.json'), {
      schemaVersion: 1,
      runId,
      status: 'completed',
      startedAt: events[0].at,
      completedAt,
      pressPageUrl: config.pressPageUrl,
      finalPressPageUrl: fetched.finalUrl,
      sourceCount: posts.length,
      acceptedCount: editor.validated.accepted.length,
      rejectedCount: editor.validated.rejected.length,
      limits: {
        maxArticles: config.maxArticles,
        fetchTimeoutMs: config.fetchTimeoutMs,
        agentTimeoutMs: config.agentTimeoutMs,
        maxPressBytes: config.maxPressBytes,
        maxAgentOutputBytes: config.maxAgentOutputBytes
      },
      agents: [
        { role: 'researcher', freshSession: true, webSearch: true, output: 'research.json' },
        { role: 'critic-editor', freshSession: true, webSearch: true, input: 'handoffs/editor-input.json', outputs: ['validated.json', 'newsletter.md'] }
      ],
      checksums
    });

    await publishLatest(config.artifactsDir, stagingDir);
    logger.log(`[press-scout] published ${runId}`);
    return { runId, postCount: posts.length, acceptedCount: editor.validated.accepted.length };
  } catch (error) {
    await fs.mkdir(path.dirname(failedDir), { recursive: true });
    try {
      await fs.rename(stagingDir, failedDir);
      await writeJson(path.join(failedDir, 'failure.json'), {
        runId,
        status: 'failed',
        failedAt: new Date().toISOString(),
        message: error.message
      });
    } catch {
      // Keep the original failure as the actionable result.
    }
    throw error;
  }
}
