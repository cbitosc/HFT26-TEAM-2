/**
 * scripts/lib/tap.js
 * Utilities for querying Astronomical TAP endpoints (IVOA Table Access Protocol)
 * and fetching/caching NASA Exoplanet Archive `ps` published solutions.
 *
 * Rules (AGENTS.md, ARCHITECTURE.md Sections 6.5, 12, 15):
 *   - Probes actual TAP schema before querying; never guesses column names.
 *   - Rejects HTTP redirects strictly (redirect: 'error').
 *   - Caches raw CSV output at `data/raw/ps.csv` so offline builds and tests never hit live network.
 *   - Never modifies or zero-fills raw values.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

export const NASA_TAP_SYNC_URL = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
export const DEFAULT_RAW_PS_PATH = path.join(ROOT, 'data', 'raw', 'ps.csv');
export const DEFAULT_PS_CONFIG_PATH = path.join(ROOT, 'data', 'config', 'columns.ps.json');

/**
 * Executes an ADQL query against a TAP sync endpoint.
 *
 * @param {string} baseUrl
 * @param {string} adql
 * @param {object} [options]
 * @param {string} [options.format='csv']
 * @param {number} [options.timeoutMs=60000]
 * @param {Function} [options.fetchImpl]
 * @returns {Promise<{ text: string, elapsedMs: number, status: number, url: string }>}
 */
export async function fetchTap(
  baseUrl,
  adql,
  { format = 'csv', timeoutMs = 60000, fetchImpl = typeof fetch === 'function' ? fetch : null } = {}
) {
  if (!fetchImpl) {
    throw new Error('fetch is not available in the current environment.');
  }

  const url = new URL(baseUrl);
  url.searchParams.set('REQUEST', 'doQuery');
  url.searchParams.set('LANG', 'ADQL');
  url.searchParams.set('FORMAT', format);
  url.searchParams.set('QUERY', adql);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const res = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'ExoplanetExplorer-SnapshotPipeline/1.0' },
      redirect: 'error',
      signal: controller.signal,
    });

    const text = await res.text();
    const elapsedMs = Date.now() - started;

    if (!res.ok) {
      throw new Error(`TAP query failed with HTTP ${res.status} (${elapsedMs}ms): ${text.slice(0, 300)}`);
    }

    if (format === 'csv' && text.trim().startsWith('<')) {
      throw new Error(`Expected CSV from TAP but received XML/HTML (${elapsedMs}ms): ${text.slice(0, 400)}`);
    }

    return { text, elapsedMs, status: res.status, url: url.toString() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probes the NASA TAP schema to verify column existence in `ps`.
 *
 * @param {string[]} columnsToVerify
 * @param {object} [options]
 * @returns {Promise<{ ok: boolean, verifiedColumns: string[], missingColumns: string[], totalPsColumns: number }>}
 */
export async function probeNasaPsColumns(
  columnsToVerify,
  { baseUrl = NASA_TAP_SYNC_URL, fetchImpl = typeof fetch === 'function' ? fetch : null } = {}
) {
  const adql = `SELECT column_name, datatype FROM TAP_SCHEMA.columns WHERE table_name = 'ps'`;
  const res = await fetchTap(baseUrl, adql, { format: 'csv', fetchImpl });

  const lines = res.text.trim().split('\n');
  const actualCols = new Set();
  for (let i = 1; i < lines.length; i++) {
    const colName = lines[i].split(',')[0]?.replace(/^["']|["']$/g, '').trim();
    if (colName) actualCols.add(colName);
  }

  const missingColumns = columnsToVerify.filter((c) => !actualCols.has(c));
  const verifiedColumns = columnsToVerify.filter((c) => actualCols.has(c));

  return {
    ok: missingColumns.length === 0,
    verifiedColumns,
    missingColumns,
    totalPsColumns: actualCols.size,
  };
}

/**
 * Retrieves NASA `ps` published solutions using the pinned column whitelist in `data/config/columns.ps.json`.
 * If `cachePath` exists and `!forceRefresh`, returns the cached file. Otherwise queries NASA TAP and caches to disk.
 *
 * @param {object} [options]
 * @param {string} [options.cachePath]
 * @param {string} [options.psConfigPath]
 * @param {boolean} [options.forceRefresh=false]
 * @param {Function} [options.fetchImpl]
 * @returns {Promise<{ rawCsvPath: string, rowCount: number, bytes: number, rawSha256: string, fromCache: boolean }>}
 */
export async function retrieveNasaPsCsv({
  cachePath = DEFAULT_RAW_PS_PATH,
  psConfigPath = DEFAULT_PS_CONFIG_PATH,
  forceRefresh = false,
  fetchImpl = typeof fetch === 'function' ? fetch : null,
} = {}) {
  // 1. Check local cache first
  if (!forceRefresh && fs.existsSync(cachePath)) {
    const rawBytes = fs.readFileSync(cachePath);
    const rawSha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
    const lineCount = rawBytes.toString('utf8').trim().split('\n').length;
    const rowCount = Math.max(0, lineCount - 1);

    return {
      rawCsvPath: cachePath,
      rowCount,
      bytes: rawBytes.length,
      rawSha256,
      fromCache: true,
    };
  }

  // 2. Load and verify columns from config
  const psConfig = JSON.parse(fs.readFileSync(psConfigPath, 'utf8'));
  const columns = psConfig.columns;
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error(`Invalid columns.ps.json: expected non-empty columns array.`);
  }

  // 3. Probe TAP schema before querying
  const probe = await probeNasaPsColumns(columns, { fetchImpl });
  if (!probe.ok) {
    throw new Error(`NASA ps TAP schema is missing expected columns: ${probe.missingColumns.join(', ')}`);
  }

  // 4. Query all rows for the whitelisted columns
  const adql = `SELECT ${columns.join(', ')} FROM ps`;
  const res = await fetchTap(NASA_TAP_SYNC_URL, adql, { format: 'csv', fetchImpl, timeoutMs: 90000 });

  const rawBuffer = Buffer.from(res.text, 'utf8');
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, rawBuffer);

  const rawSha256 = crypto.createHash('sha256').update(rawBuffer).digest('hex');
  const lineCount = res.text.trim().split('\n').length;
  const rowCount = Math.max(0, lineCount - 1);

  return {
    rawCsvPath: cachePath,
    rowCount,
    bytes: rawBuffer.length,
    rawSha256,
    fromCache: false,
  };
}

