/**
 * shared/domain/thresholds.js
 * Explorer heuristic thresholds and physical/model constants.
 *
 * Per docs/ARCHITECTURE.md Section 6.3 & 6.4:
 *   - All explorer heuristic thresholds live here with explicit "explorer heuristic" documentation
 *     so they can be surfaced transparently in UI help text.
 *   - Missing inputs always produce null, never 0.
 */

// 1. Kopparapu et al. (2013) Habitable Zone Model (Published Formula, Erratum Table 3, ApJ, 770, 82)
// Valid stellar effective temperature domain: 2600 K <= Teff <= 7200 K.
export const KOPPARAPU_2013_TEFF_MIN_K = 2600;
export const KOPPARAPU_2013_TEFF_MAX_K = 7200;
export const KOPPARAPU_2013_T_REF_K = 5780;

// Solar reference effective temperature used in Stefan-Boltzmann L = R^2 * (Teff / 5772)^4 (ARCHITECTURE.md 6.3)
export const SOLAR_TEFF_K = 5772;

// Earth bulk density reference in g/cm^3 (ARCHITECTURE.md 6.3: rho = 5.51 * M / R^3)
export const EARTH_DENSITY_G_CM3 = 5.51;

// Days per Julian year used in Kepler's third law a[AU] = cbrt(M_star * (P / 365.25)^2) (ARCHITECTURE.md 6.3)
export const DAYS_PER_YEAR = 365.25;

// 2. FORGE-lite Planet Classification Thresholds (explorer heuristic — ARCHITECTURE.md 6.3)
export const FORGE_CLASS_THRESHOLDS = Object.freeze({
  kind: 'explorer_heuristic',
  rockyMaxRadiusEarth: 1.6,        // R <= 1.6 R_earth -> rocky (unless overridden by eqt)
  subNeptuneMaxRadiusEarth: 6.0,   // 1.6 < R <= 6.0 R_earth -> sub_neptune; R > 6.0 -> gas_giant
  hotLavaMinEqTempK: 1000,         // pl_eqt >= 1000 K and rocky -> hot_lava
  icyMaxEqTempK: 250,              // pl_eqt <= 250 K and rocky/sub_neptune -> icy
});

// 3. HAB-LAB Indicator Thresholds (explorer heuristic — ARCHITECTURE.md 6.4)
export const HAB_LAB_THRESHOLDS = Object.freeze({
  kind: 'explorer_heuristic',
  // Size plausibility bands (R_earth)
  sizeRockyMaxRadiusEarth: 1.6,       // R <= 1.6: "in the range commonly associated with rocky planets"
  sizeTransitionMaxRadiusEarth: 2.5,  // 1.6 < R <= 2.5: "uncertain, may retain thick gas envelope"; >2.5: "likely gas-rich"
  sizeHighConfidenceRelErrMax: 0.10,  // relative uncertainty < 10% -> high confidence, else medium (limit -> low)

  // Mass plausibility band (M_earth)
  massPlausibleMinEarth: 0.1,
  massPlausibleMaxEarth: 10.0,
  massHighConfidenceRelErrMax: 0.15,

  // Eccentricity note threshold
  highEccentricityNoteMin: 0.2,
});

// 4. Stellar Effective Temperature Spectral Class Bands (explorer heuristic — ARCHITECTURE.md 6.4)
export const STELLAR_TEFF_BANDS = Object.freeze([
  { type: 'O', minK: 30000, maxK: Infinity, label: 'O-type hot blue star (Teff >= 30,000 K)' },
  { type: 'B', minK: 10000, maxK: 30000, label: 'B-type blue-white star (10,000–30,000 K)' },
  { type: 'A', minK: 7500, maxK: 10000, label: 'A-type white star (7,500–10,000 K)' },
  { type: 'F', minK: 6000, maxK: 7500, label: 'F-type yellow-white star (6,000–7,500 K)' },
  { type: 'G', minK: 5200, maxK: 6000, label: 'G-type Sun-like star (5,200–6,000 K)' },
  { type: 'K', minK: 3700, maxK: 5200, label: 'K-type orange dwarf star (3,700–5,200 K)' },
  { type: 'M', minK: 2400, maxK: 3700, label: 'M-type red dwarf star (2,400–3,700 K)' },
]);

// 5. Galaxy Display Compression Parameters (explorer heuristic — ARCHITECTURE.md 6.3)
// Display radius compressed with r' = k * ln(1 + r / r0) keeping unit direction vector.
export const GALAXY_DISPLAY_PARAMS = Object.freeze({
  kind: 'explorer_heuristic',
  k: 18.0,
  r0Pc: 10.0,
});

// 6. Completeness 12 Key Fields (explorer heuristic — ARCHITECTURE.md 6.3)
export const COMPLETENESS_KEY_FIELDS = Object.freeze([
  'pl_rade',
  'pl_bmasse',
  'pl_orbper',
  'pl_orbsmax',
  'pl_orbeccen',
  'pl_eqt',
  'pl_insol',
  'st_teff',
  'st_rad',
  'st_mass',
  'st_lum_linear',
  'sy_dist',
]);

