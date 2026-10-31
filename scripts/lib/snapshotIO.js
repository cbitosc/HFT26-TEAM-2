/**
 * scripts/lib/snapshotIO.js
 * Deterministic snapshot hashing and file I/O helpers.
 *
 * Rules (ARCHITECTURE.md Section 6.6, DEC-002):
 *   - Define and verify the snapshot `contentHash` separately from the raw CSV checksum (`rawCsvSha256`).
 *   - `contentHash` is the SHA-256 hex digest over the canonical JSON serialization of
 *     `{ galaxy, planets }` (and `solutions` when present in Phase 1b).
 *   - `snapshotId` format: `YYYY-MM-DD-<8 hex of contentHash>`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Computes the SHA-256 hex digest of a UTF-8 string or Buffer.
 * @param {string|Buffer} input
 * @returns {string}
 */
export function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Computes the deterministic SHA-256 `contentHash` of the compiled snapshot payload
 * (`galaxy.json` and `planets.json` bytes), completely distinct from the raw CSV SHA-256.
 *
 * @param {{ galaxyJson: string, planetsJson: string, solutionsJson?: string|null }} serializedFiles
 * @returns {string} 64-char hex SHA-256
 */
export function computeSnapshotContentHash({ galaxyJson, planetsJson, solutionsJson = null }) {
  const hash = crypto.createHash('sha256');
  hash.update('galaxy.json\n', 'utf8');
  hash.update(galaxyJson, 'utf8');
  hash.update('\nplanets.json\n', 'utf8');
  hash.update(planetsJson, 'utf8');
  if (typeof solutionsJson === 'string') {
    hash.update('\nsolutions.json\n', 'utf8');
    hash.update(solutionsJson, 'utf8');
  }
  return hash.digest('hex');
}

/**
 * Computes the SHA-256 hash of the pinned column whitelist configuration.
 * @param {string[]} pscompparsColumns
 * @param {string[]} [psColumns=[]]
 * @returns {string}
 */
export function computeColumnWhitelistHash(pscompparsColumns, psColumns = []) {
  const payload = JSON.stringify({
    pscomppars: [...pscompparsColumns],
    ps: [...psColumns],
  });
  return sha256Hex(payload);
}

/**
 * Writes a JSON file with deterministic LF newlines and returns its byte size.
 * @param {string} filePath
 * @param {string} jsonString
 * @returns {number} byte length
 */
export function writeJsonFile(filePath, jsonString) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalized = jsonString.endsWith('\n') ? jsonString : `${jsonString}\n`;
  const buf = Buffer.from(normalized, 'utf8');
  fs.writeFileSync(filePath, buf);
  return buf.length;
}

