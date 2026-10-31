/**
 * tests/domain.test.js
 * Phase 1a unit and integration tests for domain math, HAB-LAB, DISPUTE,
 * receipts, schemas, filters, and the compiled NASA pscomppars snapshot.
 */

import { describe, expect, it } from 'vitest';

import { classifyPlanet } from '../shared/domain/classify.js';
import { calcCompleteness } from '../shared/domain/completeness.js';
import { evaluateFieldDispute } from '../shared/domain/dispute.js';
import { calcGalaxyPosition } from '../shared/domain/galaxyPosition.js';
import { evaluateHabLab } from '../shared/domain/habLab.js';
import {
  buildHzEdgeFields,
  calcHzEdgesAu,
  classifyHzPosition,
} from '../shared/domain/hz.js';
import {
  calcBulkDensityGCm3,
  calcSemiMajorAxisAu,
  resolveBulkDensityField,
  resolveSemiMajorAxisField,
} from '../shared/domain/kepler.js';
import {
  calcInsolationEarth,
  calcLumFromLog10,
  calcLumFromRadiusTeff,
  resolveInsolationField,
  resolveStellarLuminosityLinear,
} from '../shared/domain/luminosity.js';
import { applyFilters } from '../shared/filters.js';
import { formatToken, makeField, makeReceiptId, parseSegments } from '../shared/receipts.js';
import { FieldSchema } from '../shared/schemas.js';
import {
  decodeGalaxySnapshot,
  decodePlanetsSnapshot,
  encodeGalaxySnapshot,
  encodePlanetsSnapshot,
} from '../shared/snapshotCodec.js';
import { parseArchiveRef } from '../scripts/lib/refs.js';
import { SIZE_BUDGETS, verifySnapshotOnDisk } from '../scripts/verify-snapshot.js';

describe('Kepler third law and bulk density (shared/domain/kepler.js)', () => {
  it('computes 1.0 AU for a 1 M_sun star and 365.25-day period', () => {
    const a = calcSemiMajorAxisAu(1.0, 365.25);
    expect(a).toBeCloseTo(1.0, 6);
  });

  it('returns null when st_mass or pl_orbper is null, zero, or negative (never 0)', () => {
    expect(calcSemiMajorAxisAu(null, 365.25)).toBeNull();
    expect(calcSemiMajorAxisAu(1.0, null)).toBeNull();
    expect(calcSemiMajorAxisAu(0, 365.25)).toBeNull();
    expect(calcSemiMajorAxisAu(1.0, -10)).toBeNull();
  });

  it('preserves archive pl_orbsmax when present and falls back to Kepler-3 only when missing and non-limit', () => {
    const archiveField = makeField({ v: 0.05, lim: 0, type: 'archive' });
    const stMass = makeField({ v: 1.0, lim: 0, type: 'archive' });
    const orbPer = makeField({ v: 365.25, lim: 0, type: 'archive' });

    const kept = resolveSemiMajorAxisField('test-b', archiveField, stMass, orbPer);
    expect(kept.v).toBe(0.05);
    expect(kept.type).toBe('archive');

    const calculated = resolveSemiMajorAxisField(
      'test-b',
      makeField({ v: null }),
      stMass,
      orbPer
    );
    expect(calculated.v).toBeCloseTo(1.0, 6);
    expect(calculated.type).toBe('calculated');
    expect(calculated.inputs).toEqual(['test-b.st_mass', 'test-b.pl_orbper']);

    // Do not compute fallback from limit-flagged period
    const limitPer = makeField({ v: 365.25, lim: 1, type: 'archive' });
    const blocked = resolveSemiMajorAxisField('test-b', makeField({ v: null }), stMass, limitPer);
    expect(blocked.v).toBeNull();
  });

  it('computes Earth bulk density (5.51 g/cm^3) and applies DEC-006 Msini vs Msin(i)/sin(i) rules', () => {
    expect(calcBulkDensityGCm3(1.0, 1.0)).toBeCloseTo(5.51, 5);
    expect(calcBulkDensityGCm3(null, 1.0)).toBeNull();

    const massField = makeField({ v: 1.0, lim: 0, type: 'archive' });
    const radField = makeField({ v: 1.0, lim: 0, type: 'archive' });

    const msiniDens = resolveBulkDensityField('p-b', makeField({ v: null }), massField, radField, 'Msini');
    expect(msiniDens.v).toBeCloseTo(5.51, 4);
    expect(msiniDens.lim).toBe(-1);
    expect(msiniDens.formula).toContain('msini_lower_bound_caveat');

    const sinICorrected = resolveBulkDensityField(
      'p-b',
      makeField({ v: null }),
      massField,
      radField,
      'Msin(i)/sin(i)'
    );
    expect(sinICorrected.v).toBeCloseTo(5.51, 4);
    expect(sinICorrected.lim).toBeNull();
    expect(sinICorrected.formula).not.toContain('msini_lower_bound_caveat');
  });
});

describe('Stellar luminosity and insolation (shared/domain/luminosity.js)', () => {
  it('computes linear luminosity from log10(L) primary route and R^2*(Teff/5772)^4 fallback route', () => {
    expect(calcLumFromLog10(0)).toBeCloseTo(1.0, 6);
    expect(calcLumFromLog10(-1)).toBeCloseTo(0.1, 6);
    expect(calcLumFromRadiusTeff(1.0, 5772)).toBeCloseTo(1.0, 6);

    const logLumField = makeField({ v: 0, lim: 0, type: 'archive' });
    const radField = makeField({ v: 1.0, lim: 0, type: 'archive' });
    const teffField = makeField({ v: 5772, lim: 0, type: 'archive' });

    const primary = resolveStellarLuminosityLinear('sun-b', logLumField, radField, teffField);
    expect(primary.route).toBe('log10');
    expect(primary.field.v).toBeCloseTo(1.0, 6);
    expect(primary.field.inputs).toEqual(['sun-b.st_lum']);

    const fallback = resolveStellarLuminosityLinear(
      'sun-b',
      makeField({ v: null }),
      radField,
      teffField
    );
    expect(fallback.route).toBe('stefan_boltzmann');
    expect(fallback.field.v).toBeCloseTo(1.0, 6);
    expect(fallback.field.inputs).toEqual(['sun-b.st_rad', 'sun-b.st_teff']);
  });

  it('computes insolation S = L / a^2 when archive pl_insol is missing', () => {
    expect(calcInsolationEarth(1.0, 1.0)).toBeCloseTo(1.0, 6);
    expect(calcInsolationEarth(1.0, 2.0)).toBeCloseTo(0.25, 6);

    const lumField = makeField({ v: 1.0, type: 'calculated', formula: 'pow10', inputs: ['p.st_lum'] });
    const aField = makeField({ v: 0.5, lim: 0, type: 'archive' });
    const insol = resolveInsolationField('p', makeField({ v: null }), lumField, aField);
    expect(insol.v).toBeCloseTo(4.0, 5);
    expect(insol.type).toBe('calculated');
    expect(insol.inputs).toEqual(['p.st_lum_linear', 'p.pl_orbsmax']);
  });
});

describe('Kopparapu et al. (2013) Erratum Table 3 Habitable Zone (DEC-003 & DEC-006)', () => {
  it('matches solar test expectations at Teff = 5780 K, L = 1.0 L_sun', () => {
    const sun = calcHzEdgesAu(5780, 1.0);
    expect(sun).not.toBeNull();
    expect(sun.recentVenusAu).toBeCloseTo(0.750312, 5);
    expect(sun.runawayGreenhouseAu).toBeCloseTo(0.981289, 5);
    expect(sun.moistGreenhouseAu).toBeCloseTo(0.992779, 5);
    expect(sun.maxGreenhouseAu).toBeCloseTo(1.688621, 5);
    // Architecture tolerance check: 1.67 +/- 0.03 AU
    expect(Math.abs(sun.maxGreenhouseAu - 1.67)).toBeLessThanOrEqual(0.03);
    expect(sun.earlyMarsAu).toBeCloseTo(1.765837, 5);
  });

  it('matches non-solar polynomial expectations for K-dwarf (4800 K, 0.3 L_sun) and M-dwarf (3800 K, 0.05 L_sun)', () => {
    const kDwarf = calcHzEdgesAu(4800, 0.3);
    expect(kDwarf).not.toBeNull();
    expect(kDwarf.seff.recentVenus).toBeCloseTo(1.645163, 5);
    expect(kDwarf.seff.runawayGreenhouse).toBeCloseTo(0.936035, 5);
    expect(kDwarf.seff.moistGreenhouse).toBeCloseTo(0.939692, 5);
    expect(kDwarf.seff.maxGreenhouse).toBeCloseTo(0.296268, 5);
    expect(kDwarf.seff.earlyMars).toBeCloseTo(0.270476, 5);
    expect(kDwarf.recentVenusAu).toBeCloseTo(0.427028, 5);
    expect(kDwarf.runawayGreenhouseAu).toBeCloseTo(0.566128, 5);
    expect(kDwarf.moistGreenhouseAu).toBeCloseTo(0.565025, 5);
    expect(kDwarf.maxGreenhouseAu).toBeCloseTo(1.006278, 5);
    expect(kDwarf.earlyMarsAu).toBeCloseTo(1.053165, 5);

    const mDwarf = calcHzEdgesAu(3800, 0.05);
    expect(mDwarf).not.toBeNull();
    expect(mDwarf.seff.recentVenus).toBeCloseTo(1.546688, 5);
    expect(mDwarf.seff.runawayGreenhouse).toBeCloseTo(0.881504, 5);
    expect(mDwarf.seff.moistGreenhouse).toBeCloseTo(0.883440, 5);
    expect(mDwarf.seff.maxGreenhouse).toBeCloseTo(0.254637, 5);
    expect(mDwarf.seff.earlyMars).toBeCloseTo(0.229803, 5);
    expect(mDwarf.recentVenusAu).toBeCloseTo(0.179797, 5);
    expect(mDwarf.runawayGreenhouseAu).toBeCloseTo(0.238162, 5);
    expect(mDwarf.moistGreenhouseAu).toBeCloseTo(0.237901, 5);
    expect(mDwarf.maxGreenhouseAu).toBeCloseTo(0.443123, 5);
    expect(mDwarf.earlyMarsAu).toBeCloseTo(0.466452, 5);
  });

  it('returns null outside the valid [2600, 7200] K domain', () => {
    expect(calcHzEdgesAu(2500, 0.01)).toBeNull();
    expect(calcHzEdgesAu(7500, 5.0)).toBeNull();
  });

  it('classifies HZ position and enforces DEC-006 unknown rule for missing or limit-bound orbital distances', () => {
    const sunEdges = calcHzEdgesAu(5780, 1.0);
    expect(classifyHzPosition(1.0, sunEdges, 0)).toBe('in_conservative');
    expect(classifyHzPosition(0.85, sunEdges, 0)).toBe('in_optimistic_only');
    expect(classifyHzPosition(1.72, sunEdges, 0)).toBe('in_optimistic_only');
    expect(classifyHzPosition(0.5, sunEdges, 0)).toBe('outside_inner');
    expect(classifyHzPosition(2.5, sunEdges, 0)).toBe('outside_outer');

    // DEC-006: uncertain/limit or missing orbital distance -> unknown
    expect(classifyHzPosition(null, sunEdges, null)).toBe('unknown');
    expect(classifyHzPosition(1.0, sunEdges, 1)).toBe('unknown');
    expect(classifyHzPosition(1.0, sunEdges, -1)).toBe('unknown');
  });
});

describe('FORGE-lite classification and completeness', () => {
  it('classifies rocky, sub_neptune, gas_giant, hot_lava, icy, and unclassified', () => {
    expect(classifyPlanet(null, 300)).toBe('unclassified');
    expect(classifyPlanet(1.0, 288, 1, 0)).toBe('unclassified'); // limit-flagged radius
    expect(classifyPlanet(1.0, 288)).toBe('rocky');
    expect(classifyPlanet(1.2, 1200)).toBe('hot_lava');
    expect(classifyPlanet(1.1, 200)).toBe('icy');
    expect(classifyPlanet(2.5, 220)).toBe('icy');
    expect(classifyPlanet(2.5, 400)).toBe('sub_neptune');
    expect(classifyPlanet(11.0, 150)).toBe('gas_giant'); // gas giant stays gas_giant even if cold
  });

  it('computes completeness fraction across the 12 key fields', () => {
    const fields = {
      pl_rade: makeField({ v: 1.0 }),
      pl_bmasse: makeField({ v: 1.0 }),
      pl_orbper: makeField({ v: 10 }),
      pl_orbsmax: makeField({ v: null }),
      pl_orbeccen: makeField({ v: null }),
      pl_eqt: makeField({ v: null }),
      pl_insol: makeField({ v: null }),
      st_teff: makeField({ v: 5780 }),
      st_rad: makeField({ v: 1.0 }),
      st_mass: makeField({ v: 1.0 }),
      st_lum_linear: makeField({ v: null }),
      sy_dist: makeField({ v: null }),
    };
    const res = calcCompleteness('test-b', fields);
    expect(res.presentCount).toBe(6);
    expect(res.totalCount).toBe(12);
    expect(res.score).toBe(0.5);
    expect(res.field.type).toBe('derived');
    expect(res.field.inputs).toHaveLength(6);
  });
});

describe('DISPUTE interval-overlap heuristic (shared/domain/dispute.js, DEC-007)', () => {
  it('flags contested: true when two assessable solutions (lim === 0) have disjoint intervals, even if a third solution lacks errors', () => {
    const stat = evaluateFieldDispute([
      { v: 1.0, e1: 0.1, e2: -0.1, lim: 0, ref: 'Paper A' },
      { v: 1.5, e1: 0.1, e2: -0.1, lim: 0, ref: 'Paper B' },
      { v: 1.2, e1: null, e2: null, lim: 0, ref: 'Paper C' },
    ]);
    expect(stat.contested).toBe(true);
    expect(stat.uncertaintyMissing).toBe(true);
    expect(stat.n).toBe(3);
    expect(stat.nAssessable).toBe(2);
  });

  it('returns contested: false ONLY when >= 2 valid distinct assessable solutions exist and all non-bound solutions are assessable with overlapping intervals', () => {
    const stat = evaluateFieldDispute([
      { v: 1.0, e1: 0.2, e2: -0.2, lim: 0, ref: 'Paper A' },
      { v: 1.15, e1: 0.15, e2: -0.15, lim: 0, ref: 'Paper B' },
    ]);
    expect(stat.contested).toBe(false);
    expect(stat.nAssessable).toBe(2);
    expect(stat.uncertaintyMissing).toBe(false);
  });

  it('returns contested: null when only 1 assessable solution exists (single-solution field)', () => {
    const single = evaluateFieldDispute([
      { v: 1.0, e1: 0.1, e2: -0.1, lim: 0, ref: 'Paper A' },
    ]);
    expect(single.contested).toBeNull();
  });

  it('treats lim === null as unknown limit status (not confirmed non-limit) and never returns contested: false when a solution has lim === null or missing errors', () => {
    const withNullLim = evaluateFieldDispute([
      { v: 1.0, e1: 0.2, e2: -0.2, lim: 0, ref: 'Paper A' },
      { v: 1.05, e1: 0.2, e2: -0.2, lim: null, ref: 'Paper B' },
    ]);
    expect(withNullLim.nUnknownLim).toBe(1);
    expect(withNullLim.contested).toBeNull();

    const withMissingErr = evaluateFieldDispute([
      { v: 1.0, e1: 0.2, e2: -0.2, lim: 0, ref: 'Paper A' },
      { v: 1.05, e1: 0.2, e2: -0.2, lim: 0, ref: 'Paper B' },
      { v: 2.5, e1: null, e2: null, lim: 0, ref: 'Paper C' }, // Never turned into [2.5, 2.5] zero-width interval!
    ]);
    expect(withMissingErr.contested).toBeNull();
    expect(withMissingErr.uncertaintyMissing).toBe(true);
  });

  it('excludes limit bounds (lim === 1 or -1) from n and counts them in nLimit', () => {
    const stat = evaluateFieldDispute([
      { v: 1.0, e1: 0.1, e2: -0.1, lim: 0, ref: 'Paper A' },
      { v: 5.0, e1: null, e2: null, lim: 1, ref: 'Paper B' },
      { v: 0.2, e1: null, e2: null, lim: -1, ref: 'Paper C' },
    ]);
    expect(stat.n).toBe(1);
    expect(stat.nLimit).toBe(2);
    expect(stat.contested).toBeNull();
  });
});

describe('HAB-LAB checklist and provenance rules (DEC-005 & DEC-006)', () => {
  it('distinguishes Msini (minimum-mass lower bound), Msin(i)/sin(i) (inclination-corrected), and M-R relationship (model-estimated) without any habitability verdict', () => {
    const baseFields = {
      pl_rade: makeField({ v: 1.1, e1: 0.05, e2: -0.05, lim: 0, type: 'archive' }),
      pl_bmasse: makeField({ v: 1.3, e1: 0.1, e2: -0.1, lim: 0, type: 'archive' }),
      pl_orbsmax: makeField({ v: 1.0, e1: 0.01, e2: -0.01, lim: 0, type: 'archive' }),
      pl_orbeccen: makeField({ v: 0.02, e1: 0.01, e2: -0.01, lim: 0, type: 'archive' }),
      st_teff: makeField({ v: 5780, e1: 50, e2: -50, lim: 0, type: 'archive' }),
      st_lum_linear: makeField({
        v: 1.0,
        type: 'calculated',
        formula: 'pow10',
        inputs: ['p.st_lum'],
      }),
    };
    const hzBuilt = buildHzEdgeFields('p', baseFields.st_teff, baseFields.st_lum_linear);
    const comp = calcCompleteness('p', {
      ...baseFields,
      pl_orbper: makeField({ v: 365.25 }),
      pl_eqt: makeField({ v: 255 }),
      pl_insol: makeField({ v: 1.0 }),
      st_rad: makeField({ v: 1.0 }),
      st_mass: makeField({ v: 1.0 }),
      sy_dist: makeField({ v: 10 }),
    });
    const allFields = { ...baseFields, ...hzBuilt, completeness: comp.field };

    const habMsini = evaluateHabLab({
      planetId: 'p',
      fields: allFields,
      hzEdges: hzBuilt.edges,
      lumRoute: 'log10',
      massProvenance: 'Msini',
      spectralTypeRaw: 'G2 V',
      completenessResult: comp,
    });
    expect(habMsini.massPlausibility.confidence).toBe('low');
    expect(habMsini.massPlausibility.label).toContain('minimum-mass lower bound');

    const habSinI = evaluateHabLab({
      planetId: 'p',
      fields: allFields,
      hzEdges: hzBuilt.edges,
      lumRoute: 'log10',
      massProvenance: 'Msin(i)/sin(i)',
      spectralTypeRaw: 'G2 V',
      completenessResult: comp,
    });
    expect(habSinI.massPlausibility.confidence).toBe('medium');
    expect(habSinI.massPlausibility.label).toContain('inclination-corrected estimate');
    expect(habSinI.massPlausibility.label).not.toContain('lower bound');

    const habMr = evaluateHabLab({
      planetId: 'p',
      fields: allFields,
      hzEdges: hzBuilt.edges,
      lumRoute: 'log10',
      massProvenance: 'M-R relationship',
      spectralTypeRaw: 'G2 V',
      completenessResult: comp,
    });
    expect(habMr.massPlausibility.confidence).toBe('low');
    expect(habMr.massPlausibility.label).toContain('model-estimated');

    // Science framing check: no indicator ever claims "is habitable" or "uninhabitable"
    const serialized = JSON.stringify({ habMsini, habSinI, habMr });
    expect(serialized).not.toMatch(/\bis habitable\b|\buninhabitable\b|\bsupports life\b/i);
  });
});

describe('Receipts, references, schemas, galaxy position, and filters', () => {
  it('parses NASA HTML anchor references and resolves relative pscp_calc.html (DEC-005 Option A)', () => {
    const calcRef = parseArchiveRef(
      '<a refstr=CALCULATED_VALUE href=/docs/pscp_calc.html target=_blank>Calculated Value</a>'
    );
    expect(calcRef.isArchiveCalculated).toBe(true);
    expect(calcRef.ref.text).toBe('Calculated Value');
    expect(calcRef.ref.href).toBe('https://exoplanetarchive.ipac.caltech.edu/docs/pscp_calc.html');
    expect(calcRef.ref.raw).toContain('refstr=CALCULATED_VALUE');

    // DEC-005 Option A schema validation: archive_calculated must keep inputs === null
    const validArchCalc = FieldSchema.safeParse({
      v: 12.2,
      e1: null,
      e2: null,
      lim: 0,
      type: 'archive_calculated',
      ref: calcRef.ref,
      formula: 'nasa_pscp_calc',
      inputs: null,
    });
    expect(validArchCalc.success).toBe(true);

    const invalidArchCalc = FieldSchema.safeParse({
      v: 12.2,
      e1: null,
      e2: null,
      lim: 0,
      type: 'archive_calculated',
      ref: calcRef.ref,
      formula: 'nasa_pscp_calc',
      inputs: ['invented.input'],
    });
    expect(invalidArchCalc.success).toBe(false);
  });

  it('parses receipt tokens into text and receipt segments', () => {
    const token = formatToken(makeReceiptId('trappist-1-e', 'pl_rade'));
    expect(token).toBe('{{r:trappist-1-e.pl_rade}}');
    const segs = parseSegments(`Radius is ${token} Earth radii.`);
    expect(segs).toEqual([
      { t: 'text', v: 'Radius is ' },
      { t: 'receipt', id: 'trappist-1-e.pl_rade' },
      { t: 'text', v: ' Earth radii.' },
    ]);
  });

  it('computes 3D galaxy position and returns null when distance or coordinates are missing', () => {
    expect(calcGalaxyPosition(null, 10, 50).posPc).toBeNull();
    expect(calcGalaxyPosition(180, 0, 10).posPc).toEqual({ x: -10, y: 0, z: 0 });
  });

  it('filters and sorts planets deterministically with missing values last', () => {
    const samplePlanets = [
      {
        id: 'a',
        name: 'Alpha b',
        hostname: 'Alpha',
        discovery: { method: 'Transit', year: 2020 },
        fields: { pl_rade: { v: 1.1 }, sy_dist: { v: 12.5 } },
        hab: { hzPosition: { status: 'in_conservative' } },
        dispute: { disputed: false },
      },
      {
        id: 'b',
        name: 'Beta b',
        hostname: 'Beta',
        discovery: { method: 'Radial Velocity', year: 2015 },
        fields: { pl_rade: { v: null }, sy_dist: { v: null } },
        hab: { hzPosition: { status: 'unknown' } },
        dispute: { disputed: true },
      },
      {
        id: 'c',
        name: 'Gamma b',
        hostname: 'Gamma',
        discovery: { method: 'Transit', year: 2022 },
        fields: { pl_rade: { v: 1.4 }, sy_dist: { v: 5.0 } },
        hab: { hzPosition: { status: 'in_optimistic_only' } },
        dispute: { disputed: false },
      },
    ];

    const hzEarthSize = applyFilters(samplePlanets, {
      radiusEarth: { min: 0.8, max: 1.6 },
      hz: 'in_optimistic',
      sortBy: 'distance',
      sortDir: 'asc',
    });
    expect(hzEarthSize.map((p) => p.id)).toEqual(['c', 'a']);

    const sortedWithNullLast = applyFilters(samplePlanets, {
      sortBy: 'distance',
      sortDir: 'asc',
    });
    expect(sortedWithNullLast.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('Phase 1a compiled snapshot verification and compact codec (scripts/verify-snapshot.js)', () => {
  it('decodes omitted values and limit flags strictly to null (never 0) and unavailable disputes to null (never uncontested)', () => {
    const encoded = encodePlanetsSnapshot([
      {
        id: 'test-b',
        name: 'Test b',
        systemId: 'test',
        hostname: 'Test',
        plLetter: 'b',
        gaiaDr3Id: null,
        status: 'confirmed',
        discovery: { method: null, year: null, facility: null, pubdate: null, ref: null },
        system: {
          starCount: null,
          planetCount: null,
          circumbinary: null,
          controversialFlag: null,
          spectralType: null,
          spectralTypeRef: null,
          raDeg: null,
          decDeg: null,
          coordRef: null,
        },
        massProvenance: null,
        massProvenanceLabel: 'unknown',
        planetClass: 'unclassified',
        completeness: 0,
        fields: {
          pl_rade: makeField({ v: null, e1: null, e2: null, lim: null, type: 'archive' }),
          pl_bmasse: makeField({
            v: 1.5,
            e1: null,
            e2: null,
            lim: 0,
            type: 'archive_calculated',
            ref: {
              text: 'Calculated Value',
              href: 'https://exoplanetarchive.ipac.caltech.edu/docs/pscp_calc.html',
              raw: '<a refstr=CALCULATED_VALUE href=/docs/pscp_calc.html target=_blank>Calculated Value</a>',
            },
            formula: 'nasa_mr_relationship',
            inputs: null,
          }),
          pl_dens: makeField({ v: null }),
          pl_orbper: makeField({ v: null }),
          pl_orbsmax: makeField({ v: null }),
          pl_orbeccen: makeField({ v: null }),
          pl_eqt: makeField({ v: null }),
          pl_insol: makeField({ v: null }),
          st_teff: makeField({ v: null }),
          st_rad: makeField({ v: null }),
          st_mass: makeField({ v: null }),
          st_lum: makeField({ v: null }),
          st_lum_linear: makeField({ v: null, type: 'calculated' }),
          sy_dist: makeField({ v: null }),
          hz_recent_venus: makeField({ v: null, type: 'calculated' }),
          hz_runaway_greenhouse: makeField({ v: null, type: 'calculated' }),
          hz_moist_greenhouse: makeField({ v: null, type: 'calculated' }),
          hz_max_greenhouse: makeField({ v: null, type: 'calculated' }),
          hz_early_mars: makeField({ v: null, type: 'calculated' }),
          completeness: makeField({
            v: 0,
            type: 'derived',
            formula: 'completeness:0/12_key_fields',
            inputs: ['test-b.pl_rade'],
          }),
        },
        hab: {
          hzPosition: { status: 'unknown', label: 'Unknown HZ', confidence: 'unknown', receipts: [], note: null },
          sizePlausibility: { status: 'unknown', label: 'Unknown size', confidence: 'unknown', receipts: [], note: null },
          massPlausibility: { status: 'terrestrial_mass_range', label: 'Model mass', confidence: 'low', receipts: ['test-b.pl_bmasse'], note: 'Note' },
          stellarType: { status: 'unknown', label: 'Unknown star', confidence: 'unknown', receipts: [], note: null },
          dataCompleteness: { status: 'low_completeness', label: '0 of 12', confidence: 'low', receipts: ['test-b.completeness'], note: null },
        },
        dispute: {
          available: false,
          disputed: null,
          fields: {
            pl_rade: { n: 0, nAssessable: 0, nLimit: 0, nUnknownLim: 0, nRefs: 0, min: null, max: null, uncertaintyMissing: false, contested: null },
            pl_bmasse: { n: 0, nAssessable: 0, nLimit: 0, nUnknownLim: 0, nRefs: 0, min: null, max: null, uncertaintyMissing: false, contested: null },
            pl_orbper: { n: 0, nAssessable: 0, nLimit: 0, nUnknownLim: 0, nRefs: 0, min: null, max: null, uncertaintyMissing: false, contested: null },
            pl_eqt: { n: 0, nAssessable: 0, nLimit: 0, nUnknownLim: 0, nRefs: 0, min: null, max: null, uncertaintyMissing: false, contested: null },
            st_teff: { n: 0, nAssessable: 0, nLimit: 0, nUnknownLim: 0, nRefs: 0, min: null, max: null, uncertaintyMissing: false, contested: null },
          },
        },
      },
    ]);

    const [decoded] = decodePlanetsSnapshot(JSON.parse(JSON.stringify(encoded)));
    expect(decoded.fields.pl_rade.v).toBeNull();
    expect(decoded.fields.pl_rade.lim).toBeNull();
    expect(decoded.fields.pl_bmasse.v).toBe(1.5);
    expect(decoded.fields.pl_bmasse.lim).toBe(0);
    expect(decoded.fields.pl_bmasse.type).toBe('archive_calculated');
    expect(decoded.fields.pl_bmasse.inputs).toBeNull();
    expect(decoded.fields.pl_bmasse.ref.raw).toContain('refstr=CALCULATED_VALUE');
    expect(decoded.dispute.available).toBe(false);
    expect(decoded.dispute.disputed).toBeNull();
    expect(decoded.dispute.fields.pl_rade.contested).toBeNull();

    const gEnc = encodeGalaxySnapshot([
      {
        systemId: 'test',
        hostname: 'Test',
        planetCount: 1,
        planetIds: ['test-b'],
        firstDiscYear: null,
        primaryMethod: null,
        syDistPc: null,
        hasPosition: false,
        posPc: null,
        posDisplay: null,
        hasDisputedPlanet: false,
        hasHzPlanet: false,
      },
    ]);
    const [gDec] = decodeGalaxySnapshot(JSON.parse(JSON.stringify(gEnc)));
    expect(gDec.syDistPc).toBeNull();
    expect(gDec.posPc).toBeNull();
    expect(gDec.hasDisputedPlanet).toBe(false);
  });

  it('passes full schema, checksum, row-count, canonical in-memory equivalence, and strict size-budget verification on disk', () => {
    const report = verifySnapshotOnDisk();
    expect(report.ok).toBe(true);
    expect(report.counts.planets).toBe(6451);
    expect(report.counts.hosts).toBe(4847);
    expect(report.duplicateNamesCount).toBe(0);
    expect(report.contentHash).not.toBe(report.rawCsvSha256);
    expect(report.canonicalMemoryComparison).toEqual({
      planetsCompared: 6451,
      hostsCompared: 4847,
      onDiskDeepStrictEqual: true,
      codecRoundTripDeepStrictEqual: true,
    });
    expect(report.fileSizes.galaxyBytes).toBeLessThan(SIZE_BUDGETS.galaxyJsonMaxBytes);
    expect(report.fileSizes.planetsBytes).toBeLessThan(SIZE_BUDGETS.planetsJsonMaxBytes);
    expect(report.fileSizes.planetsGzipBytes).toBeLessThan(SIZE_BUDGETS.planetsGzipMaxBytes);
  }, 30000);
});

