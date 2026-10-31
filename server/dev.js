/**
 * server/dev.js
 * Lightweight local Node HTTP server on `process.env.PORT || 8787` for `POST /api/helm`.
 * Never reads `.env.local` in code and never logs or exposes any keys.
 */

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import handler from '../api/helm.js';

export function createDevServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/api/helm') {
      await handler(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase();

if (isMain) {
  const port = Number(process.env.PORT) || 8787;
  const server = createDevServer();
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`HELM local server listening on http://127.0.0.1:${port}/api/helm\n`);
  });
}
