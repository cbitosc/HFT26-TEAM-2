/**
 * src/data/fieldDictionary.js
 * Labels, units, and plain-language descriptions for canonical PlanetRecord fields.
 */

export const FIELD_DICTIONARY = Object.freeze({
  pl_rade: {
    key: 'pl_rade',
    label: 'Planet Radius',
    shortLabel: 'Radius',
    unit: 'R⊕',
    category: 'planet',
    description:
      'Planet radius in Earth radii (1 R⊕ ≈ 6,371 km). Measured directly from transit depth relative to the host star radius, or estimated by NASA when direct measurements are absent.',
  },
  pl_bmasse: {
    key: 'pl_bmasse',
    label: 'Planet Mass (Best)',
    shortLabel: 'Mass',
    unit: 'M⊕',
    category: 'planet',
    description:
      'Best available planet mass in Earth masses (pl_bmasse). Check the mass provenance tag to see whether this value is a direct measurement, a minimum mass (M sin i), or a mass-radius model estimate.',
  },
  pl_dens: {
    key: 'pl_dens',
    label: 'Bulk Density',
    shortLabel: 'Density',
    unit: 'g/cm³',
    category: 'planet',
    description:
      'Mean bulk density in grams per cubic centimetre (Earth ≈ 5.51 g/cm³). Calculated from measured mass and radius when missing in the archive.',
  },
  pl_orbper: {
    key: 'pl_orbper',
    label: 'Orbital Period',
    shortLabel: 'Period',
    unit: 'days',
    category: 'orbit',
    description:
      'Time required for the planet to complete one orbit around its host star, in Earth days.',
  },
  pl_orbsmax: {
    key: 'pl_orbsmax',
    label: 'Semi-Major Axis',
    shortLabel: 'Orbit Distance',
    unit: 'AU',
    category: 'orbit',
    description:
      'Average orbital distance (semi-major axis) in Astronomical Units (1 AU ≈ Earth–Sun distance). Calculated via Kepler’s Third Law when period and stellar mass are known.',
  },
  pl_orbeccen: {
    key: 'pl_orbeccen',
    label: 'Orbital Eccentricity',
    shortLabel: 'Eccentricity',
    unit: '',
    category: 'orbit',
    description:
      'Departure of the orbit from a perfect circle (0 = circular orbit, values closer to 1 = highly elongated ellipse).',
  },
  pl_eqt: {
    key: 'pl_eqt',
    label: 'Equilibrium Temperature',
    shortLabel: 'Eq. Temp',
    unit: 'K',
    category: 'planet',
    description:
      'Theoretical blackbody temperature in Kelvin assuming zero bond albedo and uniform heat redistribution (excludes any greenhouse atmosphere).',
  },
  pl_insol: {
    key: 'pl_insol',
    label: 'Insolation Flux',
    shortLabel: 'Insolation',
    unit: 'S⊕',
    category: 'planet',
    description:
      'Stellar radiative flux incident on the planet relative to Earth (1 S⊕ = Solar constant at 1 AU).',
  },
  st_teff: {
    key: 'st_teff',
    label: 'Stellar Effective Temperature',
    shortLabel: 'Star Teff',
    unit: 'K',
    category: 'star',
    description:
      'Surface effective temperature of the host star in Kelvin (Sun ≈ 5,772 K).',
  },
  st_rad: {
    key: 'st_rad',
    label: 'Stellar Radius',
    shortLabel: 'Star Radius',
    unit: 'R☉',
    category: 'star',
    description:
      'Radius of the host star in Solar radii (1 R☉ ≈ 695,700 km).',
  },
  st_mass: {
    key: 'st_mass',
    label: 'Stellar Mass',
    shortLabel: 'Star Mass',
    unit: 'M☉',
    category: 'star',
    description:
      'Mass of the host star in Solar masses.',
  },
  st_lum: {
    key: 'st_lum',
    label: 'Stellar Luminosity (log₁₀)',
    shortLabel: 'log₁₀(L/L☉)',
    unit: 'dex',
    category: 'star',
    description:
      'Base-10 logarithm of host star bolometric luminosity in Solar luminosities as reported in NASA pscomppars.',
  },
  st_lum_linear: {
    key: 'st_lum_linear',
    label: 'Stellar Luminosity (Linear)',
    shortLabel: 'Star Luminosity',
    unit: 'L☉',
    category: 'star',
    description:
      'Linear host star bolometric luminosity in Solar units (L/L☉), computed via 10^(st_lum) or the Stefan–Boltzmann law from stellar radius and temperature.',
  },
  sy_dist: {
    key: 'sy_dist',
    label: 'System Distance',
    shortLabel: 'Distance',
    unit: 'pc',
    category: 'system',
    description:
      'Distance from the Solar System to the host star in parsecs (1 pc ≈ 3.2616 light-years).',
  },
  hz_recent_venus: {
    key: 'hz_recent_venus',
    label: 'HZ Inner Optimistic Edge (Recent Venus)',
    shortLabel: 'HZ Recent Venus',
    unit: 'AU',
    category: 'hz',
    description:
      'Optimistic inner habitable-zone boundary from Kopparapu et al. (2013) Erratum (valid for 2,600 K ≤ Teff ≤ 7,200 K).',
  },
  hz_runaway_greenhouse: {
    key: 'hz_runaway_greenhouse',
    label: 'HZ Inner Conservative Edge (Runaway Greenhouse)',
    shortLabel: 'HZ Runaway Greenhouse',
    unit: 'AU',
    category: 'hz',
    description:
      'Conservative inner habitable-zone boundary (1 M⊕ runaway greenhouse) from Kopparapu et al. (2013) Erratum.',
  },
  hz_moist_greenhouse: {
    key: 'hz_moist_greenhouse',
    label: 'HZ Moist Greenhouse Edge',
    shortLabel: 'HZ Moist Greenhouse',
    unit: 'AU',
    category: 'hz',
    description:
      'Water-loss (moist greenhouse) boundary from Kopparapu et al. (2013) Erratum.',
  },
  hz_max_greenhouse: {
    key: 'hz_max_greenhouse',
    label: 'HZ Outer Conservative Edge (Maximum Greenhouse)',
    shortLabel: 'HZ Max Greenhouse',
    unit: 'AU',
    category: 'hz',
    description:
      'Conservative outer habitable-zone boundary (CO₂ condensation maximum greenhouse) from Kopparapu et al. (2013) Erratum.',
  },
  hz_early_mars: {
    key: 'hz_early_mars',
    label: 'HZ Outer Optimistic Edge (Early Mars)',
    shortLabel: 'HZ Early Mars',
    unit: 'AU',
    category: 'hz',
    description:
      'Optimistic outer habitable-zone boundary from Kopparapu et al. (2013) Erratum.',
  },
  completeness: {
    key: 'completeness',
    label: 'Data Completeness Score',
    shortLabel: 'Completeness',
    unit: 'fraction (0–1)',
    category: 'system',
    description:
      'Fraction of the 12 core planetary, orbital, and stellar parameters present in this snapshot (explorer heuristic).',
  },
});

export const PROVENANCE_TYPE_META = Object.freeze({
  archive: {
    badge: 'A',
    title: 'Archive measurement',
    description: 'Direct observational or literature value reported in the NASA Exoplanet Archive.',
  },
  archive_calculated: {
    badge: 'AC',
    title: 'NASA composite calculation',
    description:
      'Value calculated or estimated internally by the NASA Exoplanet Archive ("Calculated Value"). Exact NASA internal input columns are not specified by the archive.',
  },
  calculated: {
    badge: 'C',
    title: 'Published formula calculation',
    description:
      'Calculated deterministically by the explorer snapshot pipeline from archive inputs using a published astrophysical formula.',
  },
  derived: {
    badge: 'D',
    title: 'Explorer heuristic',
    description:
      'Derived summary indicator computed by an explicit explorer heuristic from archive/calculated fields.',
  },
  reference: {
    badge: 'R',
    title: 'Reference constant',
    description: 'Published reference constant.',
  },
});

export const PLANET_CLASS_META = Object.freeze({
  rocky: {
    label: 'Rocky / Terrestrial',
    color: '#d98a5b',
    emissive: '#3a1c0d',
    atmosphere: '#88b4e7',
    description: 'R ≤ 1.6 R⊕ and moderate equilibrium temperature (FORGE-lite explorer heuristic).',
  },
  sub_neptune: {
    label: 'Sub-Neptune / Volatile-Rich',
    color: '#4fa3d1',
    emissive: '#102b3f',
    atmosphere: '#7fd4ff',
    description: '1.6 R⊕ < R ≤ 6.0 R⊕ (FORGE-lite explorer heuristic).',
  },
  gas_giant: {
    label: 'Gas Giant',
    color: '#d6a868',
    emissive: '#33220d',
    atmosphere: '#f0cfa0',
    description: 'R > 6.0 R⊕ (FORGE-lite explorer heuristic).',
  },
  hot_lava: {
    label: 'Ultra-Hot Rocky (Lava World)',
    color: '#ff5733',
    emissive: '#7a1600',
    atmosphere: '#ff9e44',
    description: 'R ≤ 1.6 R⊕ with equilibrium temperature ≥ 1,000 K (FORGE-lite explorer heuristic).',
  },
  icy: {
    label: 'Cold / Icy World',
    color: '#9ad5e8',
    emissive: '#183642',
    atmosphere: '#c9f0ff',
    description: 'R ≤ 6.0 R⊕ with equilibrium temperature ≤ 250 K (FORGE-lite explorer heuristic).',
  },
  unclassified: {
    label: 'Unclassified (Radius Unknown or Limit)',
    color: '#8a94a6',
    emissive: '#1f242d',
    atmosphere: '#a0aab8',
    description: 'Planet radius is missing or only an upper/lower limit in the archive.',
  },
});

/**
 * Formats a finite numeric value for display while preserving exact 0.
 * Never turns null/undefined into '0'.
 */
export function formatNumericValue(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) {
    return null;
  }
  if (v === 0) {
    return '0';
  }
  const abs = Math.abs(v);
  if (abs >= 1000) {
    return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }
  if (abs >= 10) {
    return Number(v.toFixed(2)).toString();
  }
  if (abs >= 0.01) {
    return Number(v.toFixed(4)).toString();
  }
  return v.toExponential(2);
}
