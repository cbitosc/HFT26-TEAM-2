/**
 * api/helm.js
 * Vercel Serverless Function entrypoint for `POST /api/helm`.
 * Delegates to `handleHelmRequest` in `server/helm/handler.js`.
 */

import { handleHelmRequest } from '../server/helm/handler.js';

async function readRequestBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      return req.body.trim() ? JSON.parse(req.body) : {};
    }
    if (Buffer.isBuffer(req.body)) {
      const str = req.body.toString('utf8').trim();
      return str ? JSON.parse(str) : {};
    }
    if (typeof req.body === 'object') {
      return req.body;
    }
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(payload);
  }
  const json = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(json);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method Not Allowed. Use POST /api/helm.' });
  }

  let body;
  try {
    body = await readRequestBody(req);
  } catch (_err) {
    return sendJson(res, 400, { error: 'Invalid JSON request body.' });
  }

  const clientIp =
    (typeof req.headers?.['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : null) ||
    req.headers?.['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'anonymous';

  try {
    const result = await handleHelmRequest(body, { clientIp });
    return sendJson(res, result.status, result.body);
  } catch (_err) {
    return sendJson(res, 500, { error: 'Internal HELM server error.' });
  }
}
