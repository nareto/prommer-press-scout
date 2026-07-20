import path from 'node:path';

function integer(name, fallback, { min, max }) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer`);
  const value = Number(raw);
  if (value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

function httpUrl(name, fallback) {
  const value = process.env[name] || fallback;
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use http or https`);
  }
  parsed.hash = '';
  return parsed.toString();
}

export function generationConfig(rootDir) {
  return {
    rootDir,
    artifactsDir: path.join(rootDir, 'artifacts'),
    pressPageUrl: httpUrl('PRESS_PAGE_URL', 'https://prommer.net/en/tech/press/'),
    maxArticles: integer('MAX_ARTICLES', 2, { min: 1, max: 10 }),
    fetchTimeoutMs: integer('FETCH_TIMEOUT_MS', 15_000, { min: 1_000, max: 60_000 }),
    agentTimeoutMs: integer('AGENT_TIMEOUT_MS', 600_000, { min: 10_000, max: 1_800_000 }),
    maxPressBytes: integer('MAX_PRESS_BYTES', 2_097_152, { min: 65_536, max: 10_485_760 }),
    maxAgentOutputBytes: integer('MAX_AGENT_OUTPUT_BYTES', 524_288, { min: 16_384, max: 2_097_152 })
  };
}

export function serverConfig(rootDir) {
  return {
    rootDir,
    latestDir: path.join(rootDir, 'artifacts', 'latest'),
    host: process.env.HOST || '0.0.0.0',
    port: integer('PORT', 3000, { min: 1, max: 65_535 })
  };
}
