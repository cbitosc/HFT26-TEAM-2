/**
 * shared/domain/kepler.js
 * Kepler's third law fallback for semi-major axis and bulk density calculation.
 *
 * Rules (ARCHITECTURE.md Section 6.3, DEC-006):
 *   - Semi-major axis (when archive pl_orbsmax is missing):
 *       a[AU] = cbrt(M_star[M_sun] * (P[d] / 365.25)^2)
 *     Requires positive, non-limit st_mass and pl_orbper.
 *   - Bulk density (when archive pl_dens is missing):
 *       rho[g/cm^3] = 5.51 * M[M_earth] / R[R_earth]^3
 *     Requires positive, non-limit M and R.
 *     When pl_bmassprov === 'Msini', density is flagged as a lower-bound caveat (DEC-006).
 *     'Msin(i)/sin(i)' is an inclination-corrected estimate, NOT a minimum-mass lower bound (DEC-006).
 */

import { DAYS_PER_YEAR, EARTH_DENSITY_G_CM3 } from './thresholds.js';
import { makeField, makeReceiptId } from '../receipts.js';

/**
 * Computes semi-major axis in AU from stellar mass (solar masses) and orbital period (days).
 * Returns null if either input is null, non-finite, or <= 0.
 *
 * @param {number|null} stMassSolar
 * @param {number|null} orbPerDays
 * @returns {number|null}
 */
export function calcSemiMajorAxisAu(stMassSolar, orbPerDays) {
  if (
    typeof stMassSolar !== 'number' ||
    !Number.isFinite(stMassSolar) ||
    stMassSolar <= 0 ||
    typeof orbPerDays !== 'number' ||
    !Number.isFinite(orbPerDays) ||
    orbPerDays <= 0
  ) {
    return null;
  }
  const periodYears = orbPerDays / DAYS_PER_YEAR;
  const a = Math.cbrt(stMassSolar * periodYears * periodYears);
  return Number.isFinite(a) && a > 0 ? a : null;
}

/**
 * Resolves the `pl_orbsmax` Field: uses archive value if present, or falls back to
 * Kepler's third law only if both `st_mass` and `pl_orbper` are positive and not limit bounds.
 *
 * @param {string} planetId
 * @param {object} archiveOrbsmaxField
 * @param {object} stMassField
 * @param {object} orbPerField
 * @returns {object} Field
 */
export function resolveSemiMajorAxisField(planetId, archiveOrbsmaxField, stMassField, orbPerField) {
  if (archiveOrbsmaxField && archiveOrbsmaxField.v !== null) {
    return archiveOrbsmaxField;
  }
  // Do not compute fallback from upper/lower limit bounds
  if (
    !stMassField ||
    stMassField.v === null ||
    stMassField.lim === 1 ||
    stMassField.lim === -1 ||
    !orbPerField ||
    orbPerField.v === null ||
    orbPerField.lim === 1 ||
    orbPerField.lim === -1
  ) {
    return makeField({ v: null, type: 'archive' });
  }
  const a = calcSemiMajorAxisAu(stMassField.v, orbPerField.v);
  if (a === null) {
    return makeField({ v: null, type: 'archive' });
  }
  return makeField({
    v: Number(a.toPrecision(7)),
    e1: null,
    e2: null,
    lim: null,
    type: 'calculated',
    ref: null,
    formula: 'kepler3:cbrt(st_mass*(pl_orbper/365.25)^2)',
    inputs: [makeReceiptId(planetId, 'st_mass'), makeReceiptId(planetId, 'pl_orbper')],
  });
}

/**
 * Computes bulk density in g/cm^3 from planet mass (M_earth) and radius (R_earth).
 * Returns null if either input is null, non-finite, or <= 0.
 *
 * @param {number|null} massEarth
 * @param {number|null} radiusEarth
 * @returns {number|null}
 */
export function calcBulkDensityGCm3(massEarth, radiusEarth) {
  if (
    typeof massEarth !== 'number' ||
    !Number.isFinite(massEarth) ||
    massEarth <= 0 ||
    typeof radiusEarth !== 'number' ||
    !Number.isFinite(radiusEarth) ||
    radiusEarth <= 0
  ) {
    return null;
  }
  const rho = (EARTH_DENSITY_G_CM3 * massEarth) / (radiusEarth * radiusEarth * radiusEarth);
  return Number.isFinite(rho) && rho > 0 ? rho : null;
}

/**
 * Resolves the `pl_dens` Field: uses archive value if present, or falls back to
 * `5.51 * M / R^3` when both `pl_bmasse` and `pl_rade` are known and not limit bounds.
 * Per DEC-006, if `pl_bmassprov === 'Msini'`, records the lower-bound caveat in the formula string.
 *
 * @param {string} planetId
 * @param {object} archiveDensField
 * @param {object} bmasseField
 * @param {object} radeField
 * @param {string|null} massProvenance
 * @returns {object} Field
 */
export function resolveBulkDensityField(
  planetId,
  archiveDensField,
  bmasseField,
  radeField,
  massProvenance = null
) {
  if (archiveDensField && archiveDensField.v !== null) {
    return archiveDensField;
  }
  if (
    !bmasseField ||
    bmasseField.v === null ||
    bmasseField.lim === 1 ||
    bmasseField.lim === -1 ||
    !radeField ||
    radeField.v === null ||
    radeField.lim === 1 ||
    radeField.lim === -1
  ) {
    return makeField({ v: null, type: 'archive' });
  }
  const rho = calcBulkDensityGCm3(bmasseField.v, radeField.v);
  if (rho === null) {
    return makeField({ v: null, type: 'archive' });
  }
  let formula = 'bulk_density:5.51*pl_bmasse/pl_rade^3';
  if (massProvenance === 'Msini') {
    formula = 'bulk_density:5.51*pl_bmasse/pl_rade^3 (msini_lower_bound_caveat)';
  } else if (massProvenance === 'M-R relationship') {
    formula = 'bulk_density:5.51*pl_bmasse/pl_rade^3 (mr_model_estimated_mass)';
  }
  return makeField({
    v: Number(rho.toPrecision(6)),
    e1: null,
    e2: null,
    lim: massProvenance === 'Msini' ? -1 : null,
    type: 'calculated',
    ref: null,
    formula,
    inputs: [makeReceiptId(planetId, 'pl_bmasse'), makeReceiptId(planetId, 'pl_rade')],
  });
}

