/**
 * src/data/referenceBodies.js
 * Solar System reference bodies (Earth and Jupiter) for the VERSUS side-by-side
 * comparison panel (`CompareDrawer.jsx`).
 *
 * Every numeric measurement carries `type: 'reference'` and points to the
 * NASA Planetary Fact Sheet. Missing/non-applicable catalogue fields (such as
 * parsec distance `sy_dist` from the Solar System origin) remain `null`.
 */

import { makeField } from '../../shared/receipts.js';

export const SOLAR_SYSTEM_REFERENCE_REF = Object.freeze({
  text: 'NASA Planetary Fact Sheet (Solar System Reference)',
  href: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
});

function refField(v) {
  return makeField({
    v,
    e1: null,
    e2: null,
    lim: v === null ? null : 0,
    type: 'reference',
    ref: SOLAR_SYSTEM_REFERENCE_REF,
    formula: null,
    inputs: null,
  });
}

export const REFERENCE_BODIES = Object.freeze({
  earth: Object.freeze({
    id: 'earth',
    name: 'Earth (Reference)',
    systemId: 'solar-system',
    hostname: 'Sun',
    plLetter: null,
    gaiaDr3Id: null,
    status: 'reference',
    type: 'reference',
    isReference: true,
    discovery: {
      method: 'Solar System Reference',
      year: null,
      facility: 'Solar System',
      pubdate: null,
      ref: SOLAR_SYSTEM_REFERENCE_REF,
    },
    system: {
      starCount: 1,
      planetCount: 8,
      circumbinary: false,
      controversialFlag: false,
      spectralType: 'G2V',
      spectralTypeRef: SOLAR_SYSTEM_REFERENCE_REF,
      raDeg: null,
      decDeg: null,
      coordRef: null,
    },
    massProvenance: 'Mass',
    massProvenanceLabel: 'reference',
    planetClass: 'rocky',
    completeness: 1.0,
    fields: {
      pl_rade: refField(1.0),
      pl_bmasse: refField(1.0),
      pl_dens: refField(5.51),
      pl_orbper: refField(365.256),
      pl_orbsmax: refField(1.0),
      pl_orbeccen: refField(0.0167),
      pl_eqt: refField(255),
      pl_insol: refField(1.0),
      st_teff: refField(5772),
      st_rad: refField(1.0),
      st_mass: refField(1.0),
      st_lum: refField(0),
      st_lum_linear: refField(1.0),
      sy_dist: refField(null),
      hz_recent_venus: refField(0.75),
      hz_runaway_greenhouse: refField(0.95),
      hz_moist_greenhouse: refField(0.99),
      hz_max_greenhouse: refField(1.676),
      hz_early_mars: refField(1.768),
      completeness: refField(1.0),
    },
    hab: {
      hzPosition: {
        status: 'in_conservative',
        label: 'Conservative Habitable Zone (1.00 AU; 0.95–1.68 AU)',
        confidence: 'high',
        receipts: ['earth.pl_orbsmax', 'earth.st_teff'],
        note: 'Solar System reference baseline for Kopparapu et al. (2013) Erratum.',
      },
      sizePlausibility: {
        status: 'rocky_size',
        label: '1.00 R⊕ (Solar System terrestrial reference)',
        confidence: 'high',
        receipts: ['earth.pl_rade'],
        note: null,
      },
      massPlausibility: {
        status: 'measured_terrestrial',
        label: '1.00 M⊕ (Solar System reference mass)',
        confidence: 'high',
        receipts: ['earth.pl_bmasse'],
        note: null,
      },
      stellarType: {
        status: 'fgk_dwarf',
        label: 'G2V main-sequence star (5,772 K)',
        confidence: 'high',
        receipts: ['earth.st_teff'],
        note: null,
      },
      dataCompleteness: {
        status: 'high',
        label: 'Solar System Reference (NASA Planetary Fact Sheet)',
        confidence: 'high',
        receipts: ['earth.completeness'],
        note: null,
      },
    },
    dispute: {
      available: false,
      disputed: null,
      fields: {},
    },
  }),

  jupiter: Object.freeze({
    id: 'jupiter',
    name: 'Jupiter (Reference)',
    systemId: 'solar-system',
    hostname: 'Sun',
    plLetter: null,
    gaiaDr3Id: null,
    status: 'reference',
    type: 'reference',
    isReference: true,
    discovery: {
      method: 'Solar System Reference',
      year: null,
      facility: 'Solar System',
      pubdate: null,
      ref: SOLAR_SYSTEM_REFERENCE_REF,
    },
    system: {
      starCount: 1,
      planetCount: 8,
      circumbinary: false,
      controversialFlag: false,
      spectralType: 'G2V',
      spectralTypeRef: SOLAR_SYSTEM_REFERENCE_REF,
      raDeg: null,
      decDeg: null,
      coordRef: null,
    },
    massProvenance: 'Mass',
    massProvenanceLabel: 'reference',
    planetClass: 'gas_giant',
    completeness: 1.0,
    fields: {
      pl_rade: refField(11.209),
      pl_bmasse: refField(317.83),
      pl_dens: refField(1.33),
      pl_orbper: refField(4332.59),
      pl_orbsmax: refField(5.204),
      pl_orbeccen: refField(0.0489),
      pl_eqt: refField(110),
      pl_insol: refField(0.037),
      st_teff: refField(5772),
      st_rad: refField(1.0),
      st_mass: refField(1.0),
      st_lum: refField(0),
      st_lum_linear: refField(1.0),
      sy_dist: refField(null),
      hz_recent_venus: refField(0.75),
      hz_runaway_greenhouse: refField(0.95),
      hz_moist_greenhouse: refField(0.99),
      hz_max_greenhouse: refField(1.676),
      hz_early_mars: refField(1.768),
      completeness: refField(1.0),
    },
    hab: {
      hzPosition: {
        status: 'outside_outer',
        label: 'Outside Outer HZ (5.20 AU > 1.77 AU)',
        confidence: 'high',
        receipts: ['jupiter.pl_orbsmax', 'jupiter.st_teff'],
        note: 'Orbits beyond the Solar System snow line.',
      },
      sizePlausibility: {
        status: 'gas_giant_size',
        label: '11.21 R⊕ (Gas giant reference)',
        confidence: 'high',
        receipts: ['jupiter.pl_rade'],
        note: null,
      },
      massPlausibility: {
        status: 'gas_giant_mass',
        label: '317.83 M⊕ (Gas giant reference)',
        confidence: 'high',
        receipts: ['jupiter.pl_bmasse'],
        note: null,
      },
      stellarType: {
        status: 'fgk_dwarf',
        label: 'G2V main-sequence star (5,772 K)',
        confidence: 'high',
        receipts: ['jupiter.st_teff'],
        note: null,
      },
      dataCompleteness: {
        status: 'high',
        label: 'Solar System Reference (NASA Planetary Fact Sheet)',
        confidence: 'high',
        receipts: ['jupiter.completeness'],
        note: null,
      },
    },
    dispute: {
      available: false,
      disputed: null,
      fields: {},
    },
  }),
});

/**
 * Resolves a body ID (`'earth'`, `'jupiter'`, or any canonical planet ID)
 * to a comparable PlanetRecord-shaped object.
 *
 * @param {string} id
 * @param {object} [snapshot]
 * @returns {object|null}
 */
export function resolveComparableBody(id, snapshot) {
  if (!id || typeof id !== 'string') return null;
  const trimmed = id.trim();
  const lower = trimmed.toLowerCase();

  if (REFERENCE_BODIES[lower]) {
    return REFERENCE_BODIES[lower];
  }

  if (snapshot?.planetById instanceof Map) {
    return snapshot.planetById.get(trimmed) || snapshot.planetById.get(lower) || null;
  }

  return null;
}

export default REFERENCE_BODIES;
