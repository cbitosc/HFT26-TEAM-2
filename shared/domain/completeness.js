/**
 * shared/domain/completeness.js
 * Data completeness score across the 12 key scientific fields (explorer heuristic — ARCHITECTURE.md 6.3).
 *
 * Key fields (12):
 *   pl_rade, pl_bmasse, pl_orbper, pl_orbsmax, pl_orbeccen, pl_eqt,
 *   pl_insol, st_teff, st_rad, st_mass, st_lum_linear, sy_dist
 */

import { COMPLETENESS_KEY_FIELDS } from './thresholds.js';
import { makeField, makeReceiptId } from '../receipts.js';

/**
 * Computes completeness fraction (0 to 1) and lists the present receipt IDs.
 *
 * @param {string} planetId
 * @param {Record<string, { v: number|null }>} fields
 * @returns {{ score: number, presentCount: number, totalCount: number, presentReceipts: string[], field: object }}
 */
export function calcCompleteness(planetId, fields) {
  const totalCount = COMPLETENESS_KEY_FIELDS.length;
  const presentReceipts = [];

  for (const key of COMPLETENESS_KEY_FIELDS) {
    const f = fields?.[key];
    if (f && typeof f.v === 'number' && Number.isFinite(f.v)) {
      presentReceipts.push(makeReceiptId(planetId, key));
    }
  }

  const presentCount = presentReceipts.length;
  const score = Number((presentCount / totalCount).toFixed(4));

  // If at least one key field is present, list those present receipts as inputs;
  // if 0 fields are present (unlikely), list `<planetId>.pl_rade` as reference check so inputs[] is non-empty.
  const inputs = presentReceipts.length > 0 ? presentReceipts : [makeReceiptId(planetId, 'pl_rade')];

  return {
    score,
    presentCount,
    totalCount,
    presentReceipts,
    field: makeField({
      v: score,
      e1: null,
      e2: null,
      lim: null,
      type: 'derived',
      ref: null,
      formula: `completeness:${presentCount}/${totalCount}_key_fields`,
      inputs,
    }),
  };
}

