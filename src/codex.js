import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';

async function assertExecutable(file) {
  try {
    await fs.access(file, fsConstants.X_OK);
  } catch {
    throw new Error('Pinned Codex CLI is unavailable; run npm ci before generation');
  }
}

export async function runFreshCodex({
  rootDir,
  workDir,
  prompt,
  schemaPath,
  outputPath,
  timeoutMs,
  maxOutputBytes
}) {
  const codexBin = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'codex.cmd' : 'codex');
  await assertExecutable(codexBin);
  await fs.mkdir(workDir, { recursive: true });

  const args = [
    '--search',
    'exec',
    '--ephemeral',
    '--ignore-user-config',
    '--skip-git-repo-check',
    '--sandbox', 'read-only',
    '--color', 'never',
    '--output-schema', schemaPath,
    '--output-last-message', outputPath,
    '-'
  ];

  await new Promise((resolve, reject) => {
    const child = spawn(codexBin, args, {
      cwd: workDir,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let diagnosticBytes = 0;
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const watchOutput = (chunk) => {
      diagnosticBytes += chunk.length;
      if (diagnosticBytes > maxOutputBytes) {
        child.kill('SIGKILL');
        finish(new Error('Codex diagnostic output exceeded its configured limit'));
      }
    };
    child.stdout.on('data', watchOutput);
    child.stderr.on('data', watchOutput);
    child.on('error', () => finish(new Error('Codex process could not be started')));
    child.on('close', (code, signal) => {
      if (code === 0) finish();
      else finish(new Error(`Codex process failed (${signal ? `signal ${signal}` : `exit ${code}`})`));
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
      finish(new Error(`Codex process exceeded the ${timeoutMs}ms timeout`));
    }, timeoutMs);
    timer.unref();

    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
  });

  const stat = await fs.stat(outputPath);
  if (stat.size > maxOutputBytes) throw new Error('Codex final output exceeded its configured limit');
  return fs.readFile(outputPath, 'utf8');
}
