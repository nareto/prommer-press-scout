import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_PUBLIC_ARTIFACT_BYTES = 2_097_152;

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function writeText(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, value, 'utf8');
}

async function listFiles(root, directory = root) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return files;
}

async function sha256(file) {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

export async function buildChecksums(directory) {
  const checksums = {};
  for (const relative of await listFiles(directory)) {
    if (relative === 'run.json') continue;
    checksums[relative] = await sha256(path.join(directory, relative));
  }
  return checksums;
}

export async function publishLatest(artifactsDir, stagingDir) {
  const latest = path.join(artifactsDir, 'latest');
  const backup = path.join(artifactsDir, `.previous-${process.pid}`);
  let movedPrevious = false;
  try {
    await fs.rm(backup, { recursive: true, force: true });
    try {
      await fs.rename(latest, backup);
      movedPrevious = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await fs.rename(stagingDir, latest);
    await fs.rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (movedPrevious) {
      await fs.rm(latest, { recursive: true, force: true });
      await fs.rename(backup, latest);
    }
    throw error;
  }
}

async function readBounded(file, total) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > MAX_PUBLIC_ARTIFACT_BYTES) throw new Error('Artifact is missing or oversized');
  total.bytes += stat.size;
  if (total.bytes > MAX_PUBLIC_ARTIFACT_BYTES) throw new Error('Completed artifact set is oversized');
  return fs.readFile(file, 'utf8');
}

function safeArtifactPath(latestDir, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('Invalid artifact path');
  const resolved = path.resolve(latestDir, relative);
  if (!resolved.startsWith(`${path.resolve(latestDir)}${path.sep}`)) throw new Error('Artifact path escapes latest directory');
  return resolved;
}

export async function loadCompletedArtifacts(latestDir) {
  const total = { bytes: 0 };
  let runText;
  try {
    runText = await readBounded(path.join(latestDir, 'run.json'), total);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const run = JSON.parse(runText);
  if (run.status !== 'completed' || !run.checksums || typeof run.checksums !== 'object') {
    return null;
  }

  for (const [relative, expected] of Object.entries(run.checksums)) {
    if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('Invalid artifact checksum');
    const actual = await sha256(safeArtifactPath(latestDir, relative));
    if (actual !== expected) throw new Error(`Completed artifact checksum mismatch: ${relative}`);
  }

  const required = ['inputs/posts.json', 'validated.json', 'newsletter.html'];
  for (const relative of required) {
    if (!Object.hasOwn(run.checksums, relative)) throw new Error(`Completed artifact is missing ${relative}`);
  }

  const [postsText, validatedText, newsletterHtml] = await Promise.all(required.map((relative) => (
    readBounded(safeArtifactPath(latestDir, relative), total)
  )));
  return {
    run: {
      runId: run.runId,
      status: run.status,
      completedAt: run.completedAt,
      pressPageUrl: run.pressPageUrl,
      sourceCount: run.sourceCount,
      acceptedCount: run.acceptedCount,
      rejectedCount: run.rejectedCount,
      agents: run.agents
    },
    posts: JSON.parse(postsText),
    validated: JSON.parse(validatedText),
    newsletterHtml
  };
}
