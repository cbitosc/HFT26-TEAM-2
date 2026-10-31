/**
 * shared/domain/classify.js
 * FORGE-lite planet class (explorer heuristic — ARCHITECTURE.md Section 6.3).
 *
 * Rules:
 *   - No radius (null, <= 0, or limit-bound) -> 'unclassified'
 *   - Radius bands:
 *       R <= 1.6 R_earth -> 'rocky'
 *       1.6 < R <= 6.0 R_earth -> 'sub_neptune'
 *       R > 6.0 R_earth -> 'gas_giant'
 *   - Temperature overrides (only when pl_eqt is known and non-limit):
 *       pl_eqt >= 1000 K and rocky -> 'hot_lava'
 *       pl_eqt <= 250 K and (rocky or sub_neptune) -> 'icy'
 */

import { FORGE_CLASS_THRESHOLDS } from './thresholds.js';

/**
 * Classifies a planet for FORGE-lite visual styling.
 *
 * @param {number|null} radiusEarth
 * @param {number|null} [eqTempK=null]
 * @param {number|null} [radiusLim=0]
 * @param {number|null} [eqTempLim=0]
 * @returns {'rocky' | 'sub_neptune' | 'gas_giant' | 'hot_lava' | 'icy' | 'unclassified'}
 */
export function classifyPlanet(radiusEarth, eqTempK = null, radiusLim = 0, eqTempLim = 0) {
  if (
    typeof radiusEarth !== 'number' ||
    !Number.isFinite(radiusEarth) ||
    radiusEarth <= 0 ||
    radiusLim === 1 ||
    radiusLim === -1
  ) {
    return 'unclassified';
  }

  let baseClass;
  if (radiusEarth <= FORGE_CLASS_THRESHOLDS.rockyMaxRadiusEarth) {
    baseClass = 'rocky';
  } else if (radiusEarth <= FORGE_CLASS_THRESHOLDS.subNeptuneMaxRadiusEarth) {
    baseClass = 'sub_neptune';
  } else {
    baseClass = 'gas_giant';
  }

  const hasUsableTemp =
    typeof eqTempK === 'number' &&
    Number.isFinite(eqTempK) &&
    eqTempK > 0 &&
    eqTempLim !== 1 &&
    eqTempLim !== -1;

  if (hasUsableTemp) {
    if (baseClass === 'rocky' && eqTempK >= FORGE_CLASS_THRESHOLDS.hotLavaMinEqTempK) {
      return 'hot_lava';
    }
    if (
      (baseClass === 'rocky' || baseClass === 'sub_neptune') &&
      eqTempK <= FORGE_CLASS_THRESHOLDS.icyMaxEqTempK
    ) {
      return 'icy';
    }
  }

  return baseClass;
}

