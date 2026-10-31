/**
 * shared/receipts.js
 * Receipt ID helpers, Field constructors, and HELM token segment parsing.
 *
 * Single-writer shared module owned by Reviewer / Integrator (AGENTS.md Section 2).
 */

/**
 * Formats a canonical receipt ID `<planetId>.<fieldName>`.
 * @param {string} planetId
 * @param {string} fieldName
 * @returns {string}
 */
export function makeReceiptId(planetId, fieldName) {
  if (!planetId || !fieldName) {
    throw new Error(`Invalid receipt ID components: planetId="${planetId}", fieldName="${fieldName}"`);
  }
  return `${planetId}.${fieldName}`;
}

/**
 * Formats a receipt ID into a HELM inline token `{{r:<receiptId>}}`.
 * @param {string} receiptId
 * @returns {string}
 */
export function formatToken(receiptId) {
  return `{{r:${receiptId}}}`;
}

const TOKEN_REGEX = /\{\{r:([a-z0-9._-]+)\}\}/gi;

/**
 * Splits a text containing `{{r:<receiptId>}}` tokens into alternating
 * `{ t: 'text', v }` and `{ t: 'receipt', id }` segments.
 * @param {string} text
 * @returns {Array<{t: 'text', v: string} | {t: 'receipt', id: string}>}
 */
export function parseSegments(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }
  const segments = [];
  let lastIndex = 0;
  for (const match of text.matchAll(TOKEN_REGEX)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      segments.push({ t: 'text', v: text.slice(lastIndex, idx) });
    }
    segments.push({ t: 'receipt', id: match[1] });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ t: 'text', v: text.slice(lastIndex) });
  }
  return segments;
}

/**
 * Creates a Field object with strict null defaults (never 0 for missing).
 */
export function makeField({
  v = null,
  e1 = null,
  e2 = null,
  lim = null,
  type = 'archive',
  ref = null,
  formula = null,
  inputs = null,
} = {}) {
  return {
    v: typeof v === 'number' && Number.isFinite(v) ? v : null,
    e1: typeof e1 === 'number' && Number.isFinite(e1) ? e1 : null,
    e2: typeof e2 === 'number' && Number.isFinite(e2) ? e2 : null,
    lim: lim === -1 || lim === 0 || lim === 1 ? lim : null,
    type,
    ref: ref ?? null,
    formula: formula ?? null,
    inputs: Array.isArray(inputs) ? inputs : null,
  };
}

