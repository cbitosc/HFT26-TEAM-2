/**
 * shared/domain/hz.js
 * Kopparapu et al. (2013) Habitable Zone boundaries using the human-approved
 * 2013 Erratum Table 3 coefficients (ApJ, 770, 82; DEC-003, DEC-006).
 *
 * Formula:
 *   S_eff = S_eff_sun + a*T + b*T^2 + c*T^3 + d*T^4, where T = Teff - 5780 K
 *   d[AU] = sqrt(L[L_sun] / S_eff)
 *   Valid only for 2600 K <= Teff <= 7200 K and L > 0. Outside this range, returns null.
 */

import {
  KOPPARAPU_2013_TEFF_MAX_K,
  KOPPARAPU_2013_TEFF_MIN_K,
  KOPPARAPU_2013_T_REF_K,
} from './thresholds.js';
import { makeField, makeReceiptId } from '../receipts.js';
import { isTrueOrbitalDistanceEstablished } from './kepler.js';

export { isTrueOrbitalDistanceEstablished };

export const KOPPARAPU_2013_ERRATUM_TABLE_3 = Object.freeze({
  recentVenus: Object.freeze({
    key: 'hz_recent_venus',
    formula: 'kopparapu2013_erratum:recent_venus',
    seffSun: 1.7763,
    a: 1.4335e-4,
    b: 3.3954e-9,
    c: -7.6364e-12,
    d: -1.1950e-15,
  }),
  runawayGreenhouse: Object.freeze({
    key: 'hz_runaway_greenhouse',
    formula: 'kopparapu2013_erratum:runaway_greenhouse',
    seffSun: 1.0385,
    a: 1.2456e-4,
    b: 1.4612e-8,
    c: -7.6345e-12,
    d: -1.7511e-15,
  }),
  moistGreenhouse: Object.freeze({
    key: 'hz_moist_greenhouse',
    formula: 'kopparapu2013_erratum:moist_greenhouse',
    seffSun: 1.0146,
    a: 8.1884e-5,
    b: 1.9394e-9,
    c: -4.3618e-12,
    d: -6.8260e-16,
  }),
  maxGreenhouse: Object.freeze({
    key: 'hz_max_greenhouse',
    formula: 'kopparapu2013_erratum:max_greenhouse',
    seffSun: 0.3507,
    a: 5.9578e-5,
    b: 1.6707e-9,
    c: -3.0058e-12,
    d: -5.1925e-16,
  }),
  earlyMars: Object.freeze({
    key: 'hz_early_mars',
    formula: 'kopparapu2013_erratum:early_mars',
    seffSun: 0.3207,
    a: 5.4471e-5,
    b: 1.5275e-9,
    c: -2.1709e-12,
    d: -3.8282e-16,
  }),
});

/**
 * Evaluates effective stellar flux S_eff for a single Kopparapu boundary.
 * Returns null if Teff is outside [2600, 7200] K.
 */
export function calcKopparapuSeff(teffK, coeffs) {
  if (
    typeof teffK !== 'number' ||
    !Number.isFinite(teffK) ||
    teffK < KOPPARAPU_2013_TEFF_MIN_K ||
    teffK > KOPPARAPU_2013_TEFF_MAX_K ||
    !coeffs
  ) {
    return null;
  }
  const t = teffK - KOPPARAPU_2013_T_REF_K;
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t2 * t2;
  const seff = coeffs.seffSun + coeffs.a * t + coeffs.b * t2 + coeffs.c * t3 + coeffs.d * t4;
  return Number.isFinite(seff) && seff > 0 ? seff : null;
}

/**
 * Computes all five Kopparapu et al. (2013) Erratum Table 3 HZ boundary distances in AU.
 * Returns null if Teff is outside [2600, 7200] K or lumLinearSolar <= 0.
 *
 * @param {number|null} teffK
 * @param {number|null} lumLinearSolar
 * @returns {{
 *   recentVenusAu: number,
 *   runawayGreenhouseAu: number,
 *   moistGreenhouseAu: number,
 *   maxGreenhouseAu: number,
 *   earlyMarsAu: number,
 *   seff: {
 *     recentVenus: number,
 *     runawayGreenhouse: number,
 *     moistGreenhouse: number,
 *     maxGreenhouse: number,
 *     earlyMars: number
 *   }
 * } | null}
 */
export function calcHzEdgesAu(teffK, lumLinearSolar) {
  if (
    typeof teffK !== 'number' ||
    !Number.isFinite(teffK) ||
    teffK < KOPPARAPU_2013_TEFF_MIN_K ||
    teffK > KOPPARAPU_2013_TEFF_MAX_K ||
    typeof lumLinearSolar !== 'number' ||
    !Number.isFinite(lumLinearSolar) ||
    lumLinearSolar <= 0
  ) {
    return null;
  }

  const seffRV = calcKopparapuSeff(teffK, KOPPARAPU_2013_ERRATUM_TABLE_3.recentVenus);
  const seffRG = calcKopparapuSeff(teffK, KOPPARAPU_2013_ERRATUM_TABLE_3.runawayGreenhouse);
  const seffMG = calcKopparapuSeff(teffK, KOPPARAPU_2013_ERRATUM_TABLE_3.moistGreenhouse);
  const seffMaxG = calcKopparapuSeff(teffK, KOPPARAPU_2013_ERRATUM_TABLE_3.maxGreenhouse);
  const seffEM = calcKopparapuSeff(teffK, KOPPARAPU_2013_ERRATUM_TABLE_3.earlyMars);

  if (!seffRV || !seffRG || !seffMG || !seffMaxG || !seffEM) {
    return null;
  }

  return {
    recentVenusAu: Math.sqrt(lumLinearSolar / seffRV),
    runawayGreenhouseAu: Math.sqrt(lumLinearSolar / seffRG),
    moistGreenhouseAu: Math.sqrt(lumLinearSolar / seffMG),
    maxGreenhouseAu: Math.sqrt(lumLinearSolar / seffMaxG),
    earlyMarsAu: Math.sqrt(lumLinearSolar / seffEM),
    seff: {
      recentVenus: seffRV,
      runawayGreenhouse: seffRG,
      moistGreenhouse: seffMG,
      maxGreenhouse: seffMaxG,
      earlyMars: seffEM,
    },
  };
}

/**
 * Builds the 5 `Field` objects for the HZ boundaries (`hz_recent_venus`, `hz_runaway_greenhouse`,
 * `hz_moist_greenhouse`, `hz_max_greenhouse`, `hz_early_mars`).
 */
export function buildHzEdgeFields(planetId, stTeffField, stLumLinearField) {
  const empty = () => makeField({ v: null, type: 'calculated', formula: null, inputs: null });
  if (
    !stTeffField ||
    stTeffField.v === null ||
    stTeffField.lim === 1 ||
    stTeffField.lim === -1 ||
    !stLumLinearField ||
    stLumLinearField.v === null
  ) {
    return {
      hz_recent_venus: empty(),
      hz_runaway_greenhouse: empty(),
      hz_moist_greenhouse: empty(),
      hz_max_greenhouse: empty(),
      hz_early_mars: empty(),
      edges: null,
    };
  }

  const edges = calcHzEdgesAu(stTeffField.v, stLumLinearField.v);
  if (!edges) {
    return {
      hz_recent_venus: empty(),
      hz_runaway_greenhouse: empty(),
      hz_moist_greenhouse: empty(),
      hz_max_greenhouse: empty(),
      hz_early_mars: empty(),
      edges: null,
    };
  }

  const inputs = [makeReceiptId(planetId, 'st_teff'), makeReceiptId(planetId, 'st_lum_linear')];
  const mk = (val, formula) =>
    makeField({
      v: Number(val.toPrecision(7)),
      e1: null,
      e2: null,
      lim: null,
      type: 'calculated',
      ref: null,
      formula,
      inputs,
    });

  return {
    hz_recent_venus: mk(edges.recentVenusAu, KOPPARAPU_2013_ERRATUM_TABLE_3.recentVenus.formula),
    hz_runaway_greenhouse: mk(
      edges.runawayGreenhouseAu,
      KOPPARAPU_2013_ERRATUM_TABLE_3.runawayGreenhouse.formula
    ),
    hz_moist_greenhouse: mk(
      edges.moistGreenhouseAu,
      KOPPARAPU_2013_ERRATUM_TABLE_3.moistGreenhouse.formula
    ),
    hz_max_greenhouse: mk(
      edges.maxGreenhouseAu,
      KOPPARAPU_2013_ERRATUM_TABLE_3.maxGreenhouse.formula
    ),
    hz_early_mars: mk(edges.earlyMarsAu, KOPPARAPU_2013_ERRATUM_TABLE_3.earlyMars.formula),
    edges,
  };
}

/**
 * Classifies a planet's orbital distance `aAu` relative to the HZ boundaries.
 * Per DEC-006 & DEC-012: if a usable orbital distance cannot be established (e.g. `aAu` is null, <= 0,
 * comes from a limit-flagged semi-major axis, or orbital distance is unestablished), returns `'unknown'`.
 *
 * Conservative HZ: [runawayGreenhouseAu, maxGreenhouseAu]
 * Optimistic HZ:   [recentVenusAu, earlyMarsAu]
 *
 * @param {number|null} aAu
 * @param {object|null} edges
 * @param {number|null} [orbsmaxLim=0]
 * @param {boolean} [isEstablished=true]
 * @returns {'in_conservative' | 'in_optimistic_only' | 'outside_inner' | 'outside_outer' | 'unknown'}
 */
export function classifyHzPosition(aAu, edges, orbsmaxLim = 0, isEstablished = true) {
  if (
    !isEstablished ||
    !edges ||
    typeof aAu !== 'number' ||
    !Number.isFinite(aAu) ||
    aAu <= 0 ||
    orbsmaxLim === 1 ||
    orbsmaxLim === -1
  ) {
    return 'unknown';
  }
  if (aAu < edges.recentVenusAu) {
    return 'outside_inner';
  }
  if (aAu > edges.earlyMarsAu) {
    return 'outside_outer';
  }
  if (aAu >= edges.runawayGreenhouseAu && aAu <= edges.maxGreenhouseAu) {
    return 'in_conservative';
  }
  return 'in_optimistic_only';
}

