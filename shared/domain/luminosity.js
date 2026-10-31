/**
 * shared/domain/luminosity.js
 * Stellar luminosity (linear L_sun from archive log10 st_lum or Stefan-Boltzmann fallback)
 * and planetary insolation flux S[S_earth] = L / a^2.
 *
 * Rules (ARCHITECTURE.md Section 6.3):
 *   - Primary route: L[L_sun] = 10^(st_lum) where archive `st_lum` is log10(L/L_sun).
 *   - Fallback route (lower confidence): L[L_sun] = (st_rad)^2 * (st_teff / 5772)^4
 *   - Insolation (if archive `pl_insol` is missing): S[S_earth] = L[L_sun] / (a[AU])^2
 *   - Missing or limit-bound inputs produce null, never 0.
 */

import { SOLAR_TEFF_K } from './thresholds.js';
import { makeField, makeReceiptId } from '../receipts.js';

/**
 * Converts log10(L / L_sun) to linear L / L_sun.
 * @param {number|null} log10Lum
 * @returns {number|null}
 */
export function calcLumFromLog10(log10Lum) {
  if (typeof log10Lum !== 'number' || !Number.isFinite(log10Lum)) {
    return null;
  }
  const lum = Math.pow(10, log10Lum);
  return Number.isFinite(lum) && lum > 0 ? lum : null;
}

/**
 * Computes linear stellar luminosity L / L_sun from stellar radius (R_sun) and Teff (K).
 * L = R^2 * (Teff / 5772)^4
 * @param {number|null} stRadSolar
 * @param {number|null} stTeffK
 * @returns {number|null}
 */
export function calcLumFromRadiusTeff(stRadSolar, stTeffK) {
  if (
    typeof stRadSolar !== 'number' ||
    !Number.isFinite(stRadSolar) ||
    stRadSolar <= 0 ||
    typeof stTeffK !== 'number' ||
    !Number.isFinite(stTeffK) ||
    stTeffK <= 0
  ) {
    return null;
  }
  const tRatio = stTeffK / SOLAR_TEFF_K;
  const lum = stRadSolar * stRadSolar * Math.pow(tRatio, 4);
  return Number.isFinite(lum) && lum > 0 ? lum : null;
}

/**
 * Resolves linear stellar luminosity (`st_lum_linear`) Field and route metadata.
 * Route is `'log10'` (primary), `'stefan_boltzmann'` (fallback, lower confidence), or `null`.
 *
 * @param {string} planetId
 * @param {object} stLumLogField
 * @param {object} stRadField
 * @param {object} stTeffField
 * @returns {{ field: object, route: 'log10' | 'stefan_boltzmann' | null }}
 */
export function resolveStellarLuminosityLinear(planetId, stLumLogField, stRadField, stTeffField) {
  if (
    stLumLogField &&
    stLumLogField.v !== null &&
    stLumLogField.lim !== 1 &&
    stLumLogField.lim !== -1
  ) {
    const lum = calcLumFromLog10(stLumLogField.v);
    if (lum !== null) {
      return {
        route: 'log10',
        field: makeField({
          v: Number(lum.toPrecision(7)),
          e1: null,
          e2: null,
          lim: null,
          type: 'calculated',
          ref: null,
          formula: 'pow10:10^st_lum',
          inputs: [makeReceiptId(planetId, 'st_lum')],
        }),
      };
    }
  }

  if (
    stRadField &&
    stRadField.v !== null &&
    stRadField.lim !== 1 &&
    stRadField.lim !== -1 &&
    stTeffField &&
    stTeffField.v !== null &&
    stTeffField.lim !== 1 &&
    stTeffField.lim !== -1
  ) {
    const lum = calcLumFromRadiusTeff(stRadField.v, stTeffField.v);
    if (lum !== null) {
      return {
        route: 'stefan_boltzmann',
        field: makeField({
          v: Number(lum.toPrecision(7)),
          e1: null,
          e2: null,
          lim: null,
          type: 'calculated',
          ref: null,
          formula: 'stefan_boltzmann:st_rad^2*(st_teff/5772)^4',
          inputs: [makeReceiptId(planetId, 'st_rad'), makeReceiptId(planetId, 'st_teff')],
        }),
      };
    }
  }

  return {
    route: null,
    field: makeField({ v: null, type: 'calculated', formula: null, inputs: null }),
  };
}

/**
 * Computes insolation flux S[S_earth] = L[L_sun] / (a[AU])^2.
 * @param {number|null} lumLinearSolar
 * @param {number|null} semiMajorAxisAu
 * @returns {number|null}
 */
export function calcInsolationEarth(lumLinearSolar, semiMajorAxisAu) {
  if (
    typeof lumLinearSolar !== 'number' ||
    !Number.isFinite(lumLinearSolar) ||
    lumLinearSolar <= 0 ||
    typeof semiMajorAxisAu !== 'number' ||
    !Number.isFinite(semiMajorAxisAu) ||
    semiMajorAxisAu <= 0
  ) {
    return null;
  }
  const s = lumLinearSolar / (semiMajorAxisAu * semiMajorAxisAu);
  return Number.isFinite(s) && s > 0 ? s : null;
}

/**
 * Resolves `pl_insol` Field: uses archive value if present, or falls back to `L / a^2`
 * only when true orbital semi-major axis is established (DEC-012).
 */
export function resolveInsolationField(
  planetId,
  archiveInsolField,
  stLumLinearField,
  orbsmaxField,
  isEstablished = true
) {
  if (archiveInsolField && archiveInsolField.v !== null) {
    return archiveInsolField;
  }
  if (!isEstablished) {
    return makeField({ v: null, type: 'archive' });
  }
  if (
    !stLumLinearField ||
    stLumLinearField.v === null ||
    !orbsmaxField ||
    orbsmaxField.v === null ||
    orbsmaxField.lim === 1 ||
    orbsmaxField.lim === -1
  ) {
    return makeField({ v: null, type: 'archive' });
  }
  const s = calcInsolationEarth(stLumLinearField.v, orbsmaxField.v);
  if (s === null) {
    return makeField({ v: null, type: 'archive' });
  }
  return makeField({
    v: Number(s.toPrecision(6)),
    e1: null,
    e2: null,
    lim: null,
    type: 'calculated',
    ref: null,
    formula: 'insolation:st_lum_linear/pl_orbsmax^2',
    inputs: [makeReceiptId(planetId, 'st_lum_linear'), makeReceiptId(planetId, 'pl_orbsmax')],
  });
}

