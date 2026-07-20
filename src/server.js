import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCompletedArtifacts } from './artifacts.js';
import { serverConfig } from './config.js';
import { renderHome } from './frontend.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = serverConfig(rootDir);

function send(response, status, body, contentType, headers = {}) {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...headers
  });
  response.end(body);
}

async function latest() {
  return loadCompletedArtifacts(config.latestDir);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(response, 405, 'Method not allowed\n', 'text/plain; charset=utf-8', { allow: 'GET, HEAD' });
      return;
    }

    if (url.pathname === '/healthz') {
      const artifactAvailable = Boolean(await latest());
      send(response, 200, `${JSON.stringify({ status: 'ok', artifactAvailable })}\n`, 'application/json; charset=utf-8');
      return;
    }

    if (url.pathname === '/api/latest') {
      const artifact = await latest();
      if (!artifact) {
        send(response, 404, `${JSON.stringify({ error: 'No completed manual run is published' })}\n`, 'application/json; charset=utf-8');
        return;
      }
      send(response, 200, `${JSON.stringify(artifact)}\n`, 'application/json; charset=utf-8');
      return;
    }

    if (url.pathname === '/') {
      const nonce = crypto.randomBytes(18).toString('base64');
      send(response, 200, renderHome(nonce), 'text/html; charset=utf-8', {
        'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
      });
      return;
    }

    send(response, 404, 'Not found\n', 'text/plain; charset=utf-8');
  } catch (error) {
    console.error(`[press-scout] request failed: ${error.message}`);
    send(response, 500, 'Internal server error\n', 'text/plain; charset=utf-8');
  }
});

server.listen(config.port, config.host, () => {
  console.log(`[press-scout] serving latest completed manual run on http://${config.host}:${config.port}`);
});
