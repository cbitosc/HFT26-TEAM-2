/**
 * scripts/lib/csv.js
 * NASA Exoplanet Archive CSV loader and strict column whitelist verifier.
 *
 * Rules (AGENTS.md Section 1, ARCHITECTURE.md Section 6.2, DEC-002):
 *   - Never edit raw CSVs. Preserve every row. Do not silently deduplicate.
 *   - Missing means `null` in data. Never turn a blank into 0.
 *   - Missing limit flags remain `null`, never 0 (DEC-002).
 *   - Fail loudly (throw error naming the missing column) if any whitelisted column is missing.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import Papa from 'papaparse';

const HEADER_TIMESTAMP_RE = /^#\s*([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s*$/;

const MONTH_MAP = Object.freeze({
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
});

/**
 * Extracts YYYY-MM-DD from NASA's `# Fri Oct 30 10:10:20 2026` header line if present.
 * Note per DEC-002: timezone of the header timestamp is unspecified; this date prefix is used
 * only for deterministic snapshotId naming (`YYYY-MM-DD-<8 hex>`).
 *
 * @param {string|null} headerTimestampRaw
 * @returns {string|null}
 */
export function extractDatePrefixFromHeader(headerTimestampRaw) {
  if (typeof headerTimestampRaw !== 'string') return null;
  const m = headerTimestampRaw.trim().match(/^[A-Z][a-z]{2}\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+\d{2}:\d{2}:\d{2}\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTH_MAP[m[1]];
  if (!month) return null;
  const day = String(m[2]).padStart(2, '0');
  const year = m[3];
  return `${year}-${month}-${day}`;
}

/**
 * Parses a raw string cell into a finite number or null (never turns blank into 0).
 * @param {string|undefined|null} cell
 * @returns {number|null}
 */
export function parseNullableFloat(cell) {
  if (cell === null || cell === undefined) return null;
  const trimmed = String(cell).trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'nan') {
    return null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parses a raw string cell into a finite integer or null (never turns blank into 0).
 * @param {string|undefined|null} cell
 * @returns {number|null}
 */
export function parseNullableInt(cell) {
  const num = parseNullableFloat(cell);
  if (num === null) return null;
  return Number.isInteger(num) ? num : Math.trunc(num);
}

/**
 * Parses a raw limit-flag cell (`*lim`) into `-1 | 0 | 1 | null`.
 * Per DEC-002: missing/blank limit flags MUST be `null`, never `0`.
 * @param {string|undefined|null} cell
 * @returns {-1 | 0 | 1 | null}
 */
export function parseNullableLim(cell) {
  if (cell === null || cell === undefined) return null;
  const trimmed = String(cell).trim();
  if (trimmed === '') return null;
  if (trimmed === '0') return 0;
  if (trimmed === '1') return 1;
  if (trimmed === '-1') return -1;
  const n = Number(trimmed);
  if (n === 0 || n === 1 || n === -1) return n;
  return null;
}

/**
 * Parses a raw string cell into a trimmed non-empty string or null.
 * @param {string|undefined|null} cell
 * @returns {string|null}
 */
export function parseNullableString(cell) {
  if (cell === null || cell === undefined) return null;
  const trimmed = String(cell).trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Reads and parses a NASA Exoplanet Archive CSV file, verifying all whitelisted columns exist.
 *
 * @param {string} csvPath
 * @param {string[]} requiredColumns
 * @returns {{
 *   rawBytes: number,
 *   rawSha256: string,
 *   headerTimestampRaw: string|null,
 *   commentLineCount: number,
 *   headerColumns: string[],
 *   rows: Array<Record<string, string>>
 * }}
 */
export function loadAndVerifyNasaCsv(csvPath, requiredColumns = []) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Raw CSV file not found at: ${csvPath}`);
  }

  const rawBuf = fs.readFileSync(csvPath);
  const rawBytes = rawBuf.length;
  const rawSha256 = crypto.createHash('sha256').update(rawBuf).digest('hex');

  const rawText = rawBuf.toString('utf8');
  const lines = rawText.split(/\r?\n/);

  let commentLineCount = 0;
  let headerTimestampRaw = null;
  for (const line of lines) {
    if (line.startsWith('#')) {
      commentLineCount += 1;
      if (!headerTimestampRaw) {
        const m = line.match(HEADER_TIMESTAMP_RE);
        if (m) {
          headerTimestampRaw = m[1];
        }
      }
    } else if (line.trim() !== '') {
      break;
    }
  }

  const parsed = Papa.parse(rawText, {
    header: true,
    comments: '#',
    skipEmptyLines: true,
    dynamicTyping: false, // Keep exact string cells so blanks never coerce to 0
  });

  if (parsed.errors && parsed.errors.length > 0) {
    const firstErr = parsed.errors[0];
    throw new Error(
      `CSV parse error in ${csvPath} at row ${firstErr.row ?? 'unknown'}: ${firstErr.message}`
    );
  }

  const headerColumns = parsed.meta?.fields || [];
  const headerSet = new Set(headerColumns);

  // ARCHITECTURE.md Section 6.2: fail loudly naming any missing whitelisted column
  const missingColumns = requiredColumns.filter((col) => !headerSet.has(col));
  if (missingColumns.length > 0) {
    throw new Error(
      `Missing whitelisted column(s) in ${csvPath}: ${missingColumns.join(', ')}`
    );
  }

  return {
    rawBytes,
    rawSha256,
    headerTimestampRaw,
    commentLineCount,
    headerColumns,
    rows: parsed.data,
  };
}

