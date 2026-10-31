/**
 * shared/domain/habLab.js
 * HAB-LAB five-indicator habitability checklist (ARCHITECTURE.md Section 6.4, DEC-003, DEC-005, DEC-006).
 *
 * Non-negotiable framing rule (AGENTS.md Section 1):
 *   - NEVER claim or imply a planet is habitable, uninhabitable, or supports life.
 *   - Use "habitable zone" and "potential habitability indicators".
 *   - Every indicator has `{ status, label, confidence, receipts[], note }`.
 */

import { HAB_LAB_THRESHOLDS, STELLAR_TEFF_BANDS } from './thresholds.js';
import { classifyHzPosition } from './hz.js';
import { makeReceiptId } from '../receipts.js';
import { isTrueOrbitalDistanceEstablished } from './kepler.js';

const CONFIDENCE_RANK = Object.freeze({
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
});

const RANK_TO_CONFIDENCE = Object.freeze(['unknown', 'low', 'medium', 'high']);

function minConfidence(...levels) {
  let min = 3;
  for (const lvl of levels) {
    const r = CONFIDENCE_RANK[lvl] ?? 0;
    if (r < min) min = r;
  }
  return RANK_TO_CONFIDENCE[min];
}

function relativeError(field) {
  if (
    !field ||
    typeof field.v !== 'number' ||
    !Number.isFinite(field.v) ||
    field.v === 0 ||
    typeof field.e1 !== 'number' ||
    typeof field.e2 !== 'number' ||
    !Number.isFinite(field.e1) ||
    !Number.isFinite(field.e2)
  ) {
    return null;
  }
  const maxAbsErr = Math.max(Math.abs(field.e1), Math.abs(field.e2));
  return maxAbsErr / Math.abs(field.v);
}

/**
 * 1. Habitable-Zone Position Indicator (DEC-003, DEC-006, DEC-012)
 */
export function evalHzPositionIndicator(planetId, fields, hzEdges, lumRoute, discoveryMethod = null) {
  const orbsmax = fields.pl_orbsmax;
  const stTeff = fields.st_teff;
  const stLumLinear = fields.st_lum_linear;
  const orbeccen = fields.pl_orbeccen;

  const isEstablished = discoveryMethod
    ? isTrueOrbitalDistanceEstablished(fields, discoveryMethod)
    : true;
  const status = isEstablished
    ? classifyHzPosition(orbsmax?.v ?? null, hzEdges, orbsmax?.lim ?? null, true)
    : 'unknown';

  if (status === 'unknown') {
    if (!isEstablished) {
      return {
        status: 'unknown',
        label: 'Habitable-zone position unknown (true orbital semi-major axis not established from archive measurements)',
        confidence: 'unknown',
        receipts: orbsmax && orbsmax.v !== null ? [makeReceiptId(planetId, 'pl_orbsmax')] : [],
        note: 'Archive pl_orbsmax is retained with receipt, but true 3D orbital semi-major axis is not established (potentially projected or statistical separation).',
      };
    }
    return {
      status: 'unknown',
      label: 'Habitable-zone position unknown (usable orbital distance or stellar flux boundaries unavailable)',
      confidence: 'unknown',
      receipts: [],
      note: null,
    };
  }

  // Confidence = minimum over inputs (measured=high, calculated=medium, derived L route=low, null lim=medium)
  const aConf =
    orbsmax.type === 'archive' && orbsmax.lim === 0
      ? 'high'
      : orbsmax.type === 'calculated' || orbsmax.type === 'archive_calculated' || orbsmax.lim === null
        ? 'medium'
        : 'low';
  const teffConf =
    stTeff.type === 'archive' && stTeff.lim === 0 ? 'high' : 'medium';
  const lumConf = lumRoute === 'log10' ? 'high' : lumRoute === 'stefan_boltzmann' ? 'low' : 'unknown';

  let confidence = minConfidence(aConf, teffConf, lumConf);

  let note = null;
  if (!orbeccen || orbeccen.v === null) {
    note = 'Orbital eccentricity is unknown; circular orbit assumed for semi-major axis comparison.';
  } else if (orbeccen.v >= HAB_LAB_THRESHOLDS.highEccentricityNoteMin) {
    note = `Eccentric orbit (e = ${orbeccen.v}); orbital distance varies across the year.`;
    confidence = minConfidence(confidence, 'medium');
  }

  const labels = {
    in_conservative: 'Within conservative habitable zone (Runaway to Maximum Greenhouse)',
    in_optimistic_only: 'Within optimistic habitable zone (Recent Venus to Early Mars)',
    outside_inner: 'Interior to the optimistic habitable zone (inner / hotter side)',
    outside_outer: 'Exterior to the optimistic habitable zone (outer / colder side)',
  };

  const receipts = [
    makeReceiptId(planetId, 'pl_orbsmax'),
    makeReceiptId(planetId, 'st_teff'),
    makeReceiptId(planetId, 'st_lum_linear'),
    makeReceiptId(planetId, 'hz_runaway_greenhouse'),
    makeReceiptId(planetId, 'hz_max_greenhouse'),
  ];

  return {
    status,
    label: labels[status],
    confidence,
    receipts,
    note,
  };
}

/**
 * 2. Size Plausibility Indicator (ARCHITECTURE.md 6.4, DEC-005)
 */
export function evalSizePlausibilityIndicator(planetId, fields) {
  const rade = fields.pl_rade;
  if (!rade || typeof rade.v !== 'number' || !Number.isFinite(rade.v) || rade.v <= 0) {
    return {
      status: 'unknown',
      label: 'Planet radius unknown',
      confidence: 'unknown',
      receipts: [],
      note: null,
    };
  }

  const r = rade.v;
  let status;
  let label;
  if (r <= HAB_LAB_THRESHOLDS.sizeRockyMaxRadiusEarth) {
    status = 'rocky_range';
    label = 'In the radius range commonly associated with rocky planets (<= 1.6 R⊕)';
  } else if (r <= HAB_LAB_THRESHOLDS.sizeTransitionMaxRadiusEarth) {
    status = 'transition_range';
    label = 'Transition radius range (1.6–2.5 R⊕); uncertain, may retain thick gas envelope';
  } else {
    status = 'gas_rich_range';
    label = 'Radius > 2.5 R⊕; likely gas-rich envelope';
  }

  let confidence = 'medium';
  let note = null;
  if (rade.lim === 1 || rade.lim === -1) {
    confidence = 'low';
    note = 'Radius value is an upper or lower limit bound.';
  } else if (rade.type === 'archive_calculated') {
    confidence = 'low';
    note = 'Radius is a NASA composite calculated estimate rather than a direct measurement.';
  } else {
    const relErr = relativeError(rade);
    if (relErr !== null && relErr < HAB_LAB_THRESHOLDS.sizeHighConfidenceRelErrMax && rade.lim === 0) {
      confidence = 'high';
    } else {
      confidence = 'medium';
    }
  }

  return {
    status,
    label,
    confidence,
    receipts: [makeReceiptId(planetId, 'pl_rade')],
    note,
  };
}

/**
 * 3. Mass Plausibility Indicator (ARCHITECTURE.md 6.4, DEC-005, DEC-006)
 *   - 'Msini' is a minimum-mass lower bound -> confidence capped at 'low', label says "lower bound".
 *   - 'Msin(i)/sin(i)' is an inclination-corrected estimate -> NOT a minimum-mass lower bound (DEC-006).
 *   - 'M-R relationship' is model-estimated -> confidence capped at 'low', label notes model-estimated (DEC-005).
 */
export function evalMassPlausibilityIndicator(planetId, fields, massProvenance = null) {
  const bmasse = fields.pl_bmasse;
  if (!bmasse || typeof bmasse.v !== 'number' || !Number.isFinite(bmasse.v) || bmasse.v <= 0) {
    return {
      status: 'unknown',
      label: 'Planet mass unknown',
      confidence: 'unknown',
      receipts: [],
      note: null,
    };
  }

  const m = bmasse.v;
  const inRange =
    m >= HAB_LAB_THRESHOLDS.massPlausibleMinEarth && m <= HAB_LAB_THRESHOLDS.massPlausibleMaxEarth;

  let status = inRange ? 'terrestrial_mass_range' : m < HAB_LAB_THRESHOLDS.massPlausibleMinEarth ? 'sub_terrestrial_mass' : 'high_mass';
  let label = inRange
    ? 'Within 0.1–10 M⊕ terrestrial/super-Earth mass indicator range'
    : m < HAB_LAB_THRESHOLDS.massPlausibleMinEarth
      ? 'Below 0.1 M⊕ indicator range'
      : 'Above 10 M⊕ indicator range (giant-planet mass regime)';

  let confidence = 'medium';
  let note = null;

  if (massProvenance === 'Msini') {
    // DEC-006: Msini is a minimum-mass estimate (lower bound)
    confidence = 'low';
    label += ' (minimum-mass lower bound, Msini)';
    note = 'Provenance is Msini (minimum-mass lower bound; true mass depends on orbital inclination).';
  } else if (massProvenance === 'Msin(i)/sin(i)') {
    // DEC-006: Inclination-corrected estimate, NOT a minimum mass
    confidence = 'medium';
    label += ' (inclination-corrected estimate, Msin(i)/sin(i))';
    note = 'Provenance is Msin(i)/sin(i), an inclination-corrected mass estimate (not a minimum-mass lower bound).';
  } else if (massProvenance === 'M-R relationship' || bmasse.type === 'archive_calculated') {
    // DEC-005: M-R relationship masses are model-estimated
    confidence = 'low';
    label += ' (model-estimated via M-R relationship)';
    note = 'Mass is model-estimated by NASA from radius via an empirical mass–radius relationship.';
  } else if (bmasse.lim === 1 || bmasse.lim === -1) {
    confidence = 'low';
    note = 'Mass value is an upper or lower limit bound.';
  } else {
    const relErr = relativeError(bmasse);
    if (relErr !== null && relErr < HAB_LAB_THRESHOLDS.massHighConfidenceRelErrMax && bmasse.lim === 0) {
      confidence = 'high';
    }
  }

  return {
    status,
    label,
    confidence,
    receipts: [makeReceiptId(planetId, 'pl_bmasse')],
    note,
  };
}

/**
 * 4. Stellar Type Indicator (Descriptive only — ARCHITECTURE.md 6.4)
 */
export function evalStellarTypeIndicator(planetId, fields, spectralTypeRaw = null) {
  const stTeff = fields.st_teff;
  if (!stTeff || typeof stTeff.v !== 'number' || !Number.isFinite(stTeff.v) || stTeff.v <= 0) {
    return {
      status: 'unknown',
      label: spectralTypeRaw
        ? `Host spectral type ${spectralTypeRaw} (effective temperature unknown)`
        : 'Host star effective temperature unknown',
      confidence: 'unknown',
      receipts: [],
      note: null,
    };
  }

  const teff = stTeff.v;
  const band = STELLAR_TEFF_BANDS.find((b) => teff >= b.minK && teff < b.maxK);
  const status = band ? `${band.type}_type` : 'other_stellar_type';
  const baseLabel = band ? band.label : `Host effective temperature ${Math.round(teff)} K`;
  const label = spectralTypeRaw ? `${baseLabel} (archive spectral type: ${spectralTypeRaw})` : baseLabel;

  const confidence = stTeff.lim === 1 || stTeff.lim === -1 ? 'low' : stTeff.e1 !== null && stTeff.e2 !== null ? 'high' : 'medium';

  return {
    status,
    label,
    confidence,
    receipts: [makeReceiptId(planetId, 'st_teff')],
    note: null,
  };
}

/**
 * 5. Data Completeness Indicator (ARCHITECTURE.md 6.4)
 */
export function evalCompletenessIndicator(planetId, completenessResult) {
  const { score, presentCount, totalCount } = completenessResult;
  const pct = Math.round(score * 100);
  const confidence = score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low';
  const status = score >= 0.8 ? 'high_completeness' : score >= 0.5 ? 'moderate_completeness' : 'low_completeness';

  return {
    status,
    label: `${presentCount} of ${totalCount} key planet and host-star parameters available (${pct}%)`,
    confidence,
    receipts: [makeReceiptId(planetId, 'completeness')],
    note: null,
  };
}

/**
 * Evaluates all 5 HAB-LAB indicators for a planet. Never emits a habitability verdict.
 */
export function evaluateHabLab({
  planetId,
  fields,
  hzEdges,
  lumRoute,
  massProvenance,
  spectralTypeRaw,
  completenessResult,
  discoveryMethod = null,
}) {
  return {
    hzPosition: evalHzPositionIndicator(planetId, fields, hzEdges, lumRoute, discoveryMethod),
    sizePlausibility: evalSizePlausibilityIndicator(planetId, fields),
    massPlausibility: evalMassPlausibilityIndicator(planetId, fields, massProvenance),
    stellarType: evalStellarTypeIndicator(planetId, fields, spectralTypeRaw),
    dataCompleteness: evalCompletenessIndicator(planetId, completenessResult),
  };
}

