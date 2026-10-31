/**
 * shared/domain/dispute.js
 * DISPUTE interval-overlap heuristic across published solutions (ARCHITECTURE.md 6.5, DEC-007).
 *
 * Rules (DEC-007):
 *   1. Never turn missing errors into 0. A solution lacking `e1` or `e2` has
 *      `uncertaintyMissing: true` and is NEVER treated as a zero-width [v, v] interval.
 *   2. Limit flags:
 *      - `lim === 1` or `lim === -1` is a limit bound (counted in `nLimit`, excluded from intervals).
 *      - `lim === null` is UNKNOWN limit status, NOT a confirmed non-limit measurement (counted in `nUnknownLim`).
 *      - An assessable solution strictly requires `lim === 0` (confirmed non-limit) AND finite non-null
 *        `v`, `e1` (>= 0), and `e2` (<= 0), forming interval [v + e2, v + e1].
 *   3. Evaluating `contested` (explorer heuristic, not proof of statistical significance):
 *      - Deduplicate identical (v, e1, e2, lim, ref) tuples if needed, or evaluate distinct solutions.
 *      - `contested: true`: if there are >= 2 distinct assessable solutions (`lim === 0`, known `v, e1, e2`)
 *        and ANY pair of assessable intervals does not overlap (`a.high < b.low || b.high < a.low`).
 *      - `contested: false`: ONLY when there are at least 2 (`nAssessable >= 2`) valid, distinct assessable
 *        solutions, ALL non-bound solutions (`lim !== 1 && lim !== -1`) for that field are assessable
 *        (`nUnknownLim === 0` and no missing uncertainties among them), and NO pair is disjoint.
 *      - `contested: null` ("cannot assess"): in all other cases (e.g., fewer than 2 distinct assessable
 *        solutions, or no assessable pair is disjoint while at least one non-bound solution has `lim === null`
 *        or missing uncertainties).
 */

export const DISPUTE_FIELDS = Object.freeze([
  'pl_rade',
  'pl_bmasse',
  'pl_orbper',
  'pl_eqt',
  'st_teff',
]);

/**
 * Checks whether two closed intervals [lowA, highA] and [lowB, highB] are disjoint.
 * Includes a tiny epsilon (1e-12) to avoid IEEE-754 floating-point false positives when endpoints touch.
 */
export function areIntervalsDisjoint(lowA, highA, lowB, highB) {
  const eps = 1e-12;
  return highA + eps < lowB || highB + eps < lowA;
}

/**
 * Evaluates DISPUTE statistics for a single field across an array of solution objects.
 * Each solution has `{ v: number|null, e1: number|null, e2: number|null, lim: -1|0|1|null, ref?: string|null }`.
 *
 * @param {Array<{ v: number|null, e1?: number|null, e2?: number|null, lim?: number|null, ref?: string|null }>} solutions
 * @returns {{
 *   n: number,
 *   nAssessable: number,
 *   nLimit: number,
 *   nUnknownLim: number,
 *   nRefs: number,
 *   min: number|null,
 *   max: number|null,
 *   uncertaintyMissing: boolean,
 *   contested: boolean|null
 * }}
 */
export function evaluateFieldDispute(solutions = []) {
  if (!Array.isArray(solutions) || solutions.length === 0) {
    return {
      n: 0,
      nAssessable: 0,
      nLimit: 0,
      nUnknownLim: 0,
      nRefs: 0,
      min: null,
      max: null,
      uncertaintyMissing: false,
      contested: null,
    };
  }

  let nLimit = 0;
  let nUnknownLim = 0;
  let uncertaintyMissing = false;
  const nonBoundSolutions = [];
  const refs = new Set();

  for (const sol of solutions) {
    if (!sol || typeof sol.v !== 'number' || !Number.isFinite(sol.v)) {
      continue;
    }
    if (sol.lim === 1 || sol.lim === -1) {
      nLimit += 1;
      continue;
    }
    nonBoundSolutions.push(sol);
    if (typeof sol.ref === 'string' && sol.ref.trim()) {
      refs.add(sol.ref.trim());
    }
  }

  // Deduplicate exact solution measurements by (v, e1, e2, lim, ref) so duplicate rows don't fake n >= 2
  const distinctNonBound = [];
  const seenKeys = new Set();
  for (const sol of nonBoundSolutions) {
    const key = `${sol.v}|${sol.e1 ?? 'null'}|${sol.e2 ?? 'null'}|${sol.lim ?? 'null'}|${sol.ref ?? ''}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      distinctNonBound.push(sol);
    }
  }

  const n = distinctNonBound.length;
  if (n === 0) {
    return {
      n: 0,
      nAssessable: 0,
      nLimit,
      nUnknownLim: 0,
      nRefs: refs.size,
      min: null,
      max: null,
      uncertaintyMissing: false,
      contested: null,
    };
  }

  let min = Infinity;
  let max = -Infinity;
  const assessableIntervals = [];

  for (const sol of distinctNonBound) {
    if (sol.v < min) min = sol.v;
    if (sol.v > max) max = sol.v;

    if (sol.lim !== 0) {
      // DEC-007: lim === null is unknown limit status, not confirmed non-limit
      nUnknownLim += 1;
    }

    const hasE1 = typeof sol.e1 === 'number' && Number.isFinite(sol.e1) && sol.e1 >= 0;
    const hasE2 = typeof sol.e2 === 'number' && Number.isFinite(sol.e2) && sol.e2 <= 0;

    if (!hasE1 || !hasE2) {
      uncertaintyMissing = true;
      continue;
    }

    if (sol.lim === 0) {
      const low = sol.v + sol.e2;
      const high = sol.v + sol.e1;
      assessableIntervals.push({ low, high, v: sol.v });
    }
  }

  const nAssessable = assessableIntervals.length;

  // Check if any pair of assessable solutions has non-overlapping intervals
  let anyPairDisjoint = false;
  if (nAssessable >= 2) {
    for (let i = 0; i < nAssessable; i++) {
      for (let j = i + 1; j < nAssessable; j++) {
        if (
          areIntervalsDisjoint(
            assessableIntervals[i].low,
            assessableIntervals[i].high,
            assessableIntervals[j].low,
            assessableIntervals[j].high
          )
        ) {
          anyPairDisjoint = true;
          break;
        }
      }
      if (anyPairDisjoint) break;
    }
  }

  let contested = null;
  if (anyPairDisjoint) {
    // DEC-007: Two valid, non-overlapping intervals flag a dispute even if another solution has missing errors/null lim
    contested = true;
  } else if (nAssessable >= 2 && nAssessable === n && !uncertaintyMissing && nUnknownLim === 0) {
    // DEC-007: Return false ONLY when >= 2 valid distinct assessable solutions exist, all relevant solutions are assessable, and no pair is disjoint
    contested = false;
  } else {
    contested = null;
  }

  return {
    n,
    nAssessable,
    nLimit,
    nUnknownLim,
    nRefs: refs.size,
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
    uncertaintyMissing,
    contested,
  };
}

/**
 * Builds an empty Phase 1a placeholder DisputeSummary (before `ps` solutions are joined in Phase 1b),
 * or evaluates full DISPUTE summary when a map of field -> solutions[] is provided.
 *
 * @param {Record<string, Array<object>> | null} [solutionsByField=null]
 * @returns {{ available: boolean, disputed: boolean|null, fields: Record<string, object> }}
 */
export function buildDisputeSummary(solutionsByField = null) {
  const fields = {};
  if (!solutionsByField) {
    for (const f of DISPUTE_FIELDS) {
      fields[f] = evaluateFieldDispute([]);
    }
    return {
      available: false,
      disputed: null,
      fields,
    };
  }

  let anyContested = false;
  let anyAssessedFalse = false;
  for (const f of DISPUTE_FIELDS) {
    const stat = evaluateFieldDispute(solutionsByField[f] || []);
    fields[f] = stat;
    if (stat.contested === true) anyContested = true;
    if (stat.contested === false) anyAssessedFalse = true;
  }

  return {
    available: true,
    disputed: anyContested ? true : anyAssessedFalse ? false : null,
    fields,
  };
}

