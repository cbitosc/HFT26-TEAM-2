/**
 * tests/crosscatalog.test.js
 * Unit and integration tests for exoplanet.eu + Exo-MerCat cross-catalog pipeline.
 *
 * Rules (AGENTS.md, ARCHITECTURE.md Sections 6.1, 6.5, 6.7, 6.8, 15):
 *   - Name reconciliation: Exo-MerCat bridge first -> normalized fallback -> unmatched is "not compared".
 *   - Raw cross-catalog values remain strictly git-ignored (DEC-004) until human licensing approval.
 *   - Derived flags: 'agree', 'disagree', 'not compared'.
 *   - Unmatched planets MUST show 'not compared', never 'disagree'.
 *   - Preserve missing values as null.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  RJUP_TO_REARTH,
  MJUP_TO_MEARTH,
  compareFieldInterval,
  compareStatus,
  normalizeEuRecord,
  buildCrossCatalogComparison,
  buildDerivedFlags,
} from '../scripts/crosscatalog.js';
import { buildNameBridge, normalizePlanetName } from '../scripts/lib/names.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('Cross-Catalog Name Reconciliation (Exo-MerCat Bridge)', () => {
  const sampleBridgeRows = [
    {
      id: '3',
      nasa_name: '6 Lyn b',
      eu_name: '6 Lyn b',
      original_status_string: 'eu: CONFIRMED,nasa: CONFIRMED,oec: CONFIRMED',
      status: 'CONFIRMED',
    },
    {
      id: '4',
      nasa_name: '8 UMi b',
      eu_name: '8 Umi b',
      original_status_string: 'eu: CONFIRMED,nasa: CONFIRMED,oec: CONFIRMED',
      status: 'CONFIRMED',
    },
    {
      id: '5',
      nasa_name: '11 Com b',
      eu_name: '11 Com Ab',
      original_status_string: 'eu: CONFIRMED,nasa: CONFIRMED,oec: CONFIRMED',
      status: 'CONFIRMED',
    },
    {
      id: '100',
      nasa_name: '',
      eu_name: 'TOI-1098 Ab',
      toi_name: 'TOI-1098.01',
      original_status_string: 'eu: CANDIDATE,toi: CANDIDATE',
      status: 'CANDIDATE',
    },
  ];

  it('normalizes planet names deterministically', () => {
    expect(normalizePlanetName('TRAPPIST-1 e')).toBe('trappist1e');
    expect(normalizePlanetName('HD 142022 A b')).toBe('hd142022ab');
    expect(normalizePlanetName('8 UMi b')).toBe('8umib');
    expect(normalizePlanetName('8 Umi b')).toBe('8umib');
    expect(normalizePlanetName('')).toBe('');
    expect(normalizePlanetName(null)).toBe('');
  });

  it('matches exact NASA name in Exo-MerCat bridge', () => {
    const bridge = buildNameBridge(sampleBridgeRows);
    const match = bridge.lookup('6 Lyn b');
    expect(match).not.toBeNull();
    expect(match.euName).toBe('6 Lyn b');
    expect(match.matchedBy).toBe('exact');
  });

  it('matches normalized NASA name when capitalization differs (8 UMi b vs 8 Umi b)', () => {
    const bridge = buildNameBridge(sampleBridgeRows);
    const match = bridge.lookup('8 UMI b');
    expect(match).not.toBeNull();
    expect(match.euName).toBe('8 Umi b');
    expect(match.matchedBy).toBe('normalized');
  });

  it('matches resolved designation in Exo-MerCat (11 Com b -> 11 Com Ab)', () => {
    const bridge = buildNameBridge(sampleBridgeRows);
    const match = bridge.lookup('11 Com b');
    expect(match).not.toBeNull();
    expect(match.euName).toBe('11 Com Ab');
    expect(match.matchedBy).toBe('exact');
  });

  it('matches by secondary alias when direct NASA name is blank', () => {
    const bridge = buildNameBridge(sampleBridgeRows);
    const match = bridge.lookup('TOI-1098.01');
    expect(match).not.toBeNull();
    expect(match.euName).toBe('TOI-1098 Ab');
    expect(match.matchedBy).toBe('alias');
  });

  it('returns null for truly unmatched planets', () => {
    const bridge = buildNameBridge(sampleBridgeRows);
    const match = bridge.lookup('Nonexistent Planet 999 z');
    expect(match).toBeNull();
  });
});

describe('Cross-Catalog Status Comparison (Architecture Section 6.5)', () => {
  it('flags status as agree when both catalogs confirm the planet', () => {
    expect(compareStatus('confirmed', 'CONFIRMED')).toBe('agree');
    expect(compareStatus('confirmed', 'Confirmed')).toBe('agree');
    expect(compareStatus('confirmed', 'eu: CONFIRMED')).toBe('agree');
  });

  it('flags status as disagree when NASA is confirmed but EU is candidate or retracted', () => {
    expect(compareStatus('confirmed', 'CANDIDATE')).toBe('disagree');
    expect(compareStatus('confirmed', 'Candidate')).toBe('disagree');
    expect(compareStatus('confirmed', 'UNCONFIRMED')).toBe('disagree');
    expect(compareStatus('confirmed', 'Retracted')).toBe('disagree');
  });

  it('flags status as not compared when EU status is missing, null, or empty', () => {
    expect(compareStatus('confirmed', null)).toBe('not compared');
    expect(compareStatus('confirmed', '')).toBe('not compared');
    expect(compareStatus('confirmed', undefined)).toBe('not compared');
  });
});

describe('Cross-Catalog Field Interval Overlap (Architecture Section 6.5)', () => {
  it('flags agree when reported parameter intervals overlap', () => {
    // NASA: 1.0 ± 0.1 [0.9, 1.1]
    // EU: 1.05 ± 0.1 [0.95, 1.15]
    const nasa = { v: 1.0, e1: 0.1, e2: -0.1, lim: 0 };
    const eu = { v: 1.05, e1: 0.1, e2: -0.1 };
    const result = compareFieldInterval(nasa, eu);

    expect(result.flag).toBe('agree');
    expect(result.status).toBe('agree');
    expect(result.agreement).toBe(true);
  });

  it('flags disagree when reported parameter intervals are disjoint', () => {
    // NASA: 1.0 ± 0.05 [0.95, 1.05]
    // EU: 1.50 ± 0.10 [1.40, 1.60]
    const nasa = { v: 1.0, e1: 0.05, e2: -0.05, lim: 0 };
    const eu = { v: 1.5, e1: 0.1, e2: -0.1 };
    const result = compareFieldInterval(nasa, eu);

    expect(result.flag).toBe('disagree');
    expect(result.status).toBe('disagree');
    expect(result.agreement).toBe(false);
  });

  it('flags cannot assess when neither side has uncertainty (Section 6.5 rule)', () => {
    // NASA: 1.0 (no e1, e2)
    // EU: 1.02 (no e1, e2)
    const nasa = { v: 1.0, e1: null, e2: null, lim: 0 };
    const eu = { v: 1.02, e1: null, e2: null };
    const result = compareFieldInterval(nasa, eu);

    expect(result.flag).toBe('not compared');
    expect(result.status).toBe('cannot assess');
    expect(result.agreement).toBeNull();
    expect(result.reason).toContain('Uncertainty missing on both sides');
  });

  it('flags not compared when value is missing in either catalog', () => {
    const nasa = { v: 1.0, e1: 0.1, e2: -0.1, lim: 0 };
    const euNull = { v: null, e1: null, e2: null };
    const result1 = compareFieldInterval(nasa, euNull);
    expect(result1.flag).toBe('not compared');
    expect(result1.status).toBe('not compared');
    expect(result1.agreement).toBeNull();

    const nasaNull = { v: null, e1: null, e2: null, lim: null };
    const eu = { v: 1.0, e1: 0.1, e2: -0.1 };
    const result2 = compareFieldInterval(nasaNull, eu);
    expect(result2.flag).toBe('not compared');
    expect(result2.status).toBe('not compared');
    expect(result2.agreement).toBeNull();
  });
});

describe('Full Cross-Catalog Comparison Builder & Unmatched Rule', () => {
  const sampleNasaPlanets = [
    {
      id: 'matched-planet-1',
      name: 'Alpha Planet b',
      status: 'confirmed',
      fields: {
        pl_rade: { v: 1.0, e1: 0.1, e2: -0.1, lim: 0 },
        pl_bmasse: { v: 1.0, e1: 0.2, e2: -0.2, lim: 0 },
        pl_orbper: { v: 10.0, e1: 0.01, e2: -0.01, lim: 0 },
        pl_orbsmax: { v: 0.1, e1: 0.01, e2: -0.01, lim: 0 },
        st_teff: { v: 5000, e1: 50, e2: -50, lim: 0 },
      },
    },
    {
      id: 'unmatched-planet-2',
      name: 'Unmatched Planet c',
      status: 'confirmed',
      fields: {
        pl_rade: { v: 2.0, e1: 0.2, e2: -0.2, lim: 0 },
        pl_bmasse: { v: 5.0, e1: 1.0, e2: -1.0, lim: 0 },
        pl_orbper: { v: 25.0, e1: 0.05, e2: -0.05, lim: 0 },
        pl_orbsmax: { v: 0.25, e1: 0.02, e2: -0.02, lim: 0 },
        st_teff: { v: 6000, e1: 80, e2: -80, lim: 0 },
      },
    },
  ];

  const sampleBridge = [
    {
      nasa_name: 'Alpha Planet b',
      eu_name: 'Alpha Planet b',
      status: 'CONFIRMED',
      original_status_string: 'eu: CONFIRMED',
    },
  ];

  const sampleEuRows = [
    {
      name: 'Alpha Planet b',
      planet_status: 'Confirmed',
      planet_radius: (1.05 / RJUP_TO_REARTH).toString(), // in RJup
      planet_mass: (1.02 / MJUP_TO_MEARTH).toString(),   // in MJup
      orbital_period: '10.02',
      semi_major_axis: '0.101',
      star_t_eff: '5020',
    },
  ];

  it('MUST show "not compared" for unmatched planets, NEVER "disagree"', () => {
    const result = buildCrossCatalogComparison(
      sampleNasaPlanets,
      sampleBridge,
      sampleEuRows,
      { snapshotId: 'test-snapshot' }
    );

    const unmatched = result.planets['unmatched-planet-2'];
    expect(unmatched).toBeDefined();
    expect(unmatched.matched).toBe(false);
    expect(unmatched.status.flag).toBe('not compared');
    expect(unmatched.status.flag).not.toBe('disagree');

    // All fields for unmatched planet MUST be 'not compared'
    for (const fk of Object.keys(unmatched.fields)) {
      expect(unmatched.fields[fk].flag).toBe('not compared');
      expect(unmatched.fields[fk].status).toBe('not compared');
      expect(unmatched.fields[fk].agreement).toBeNull();
    }
  });

  it('correctly compares matched planet fields and applies unit conversions', () => {
    const result = buildCrossCatalogComparison(
      sampleNasaPlanets,
      sampleBridge,
      sampleEuRows,
      { snapshotId: 'test-snapshot' }
    );

    const matched = result.planets['matched-planet-1'];
    expect(matched).toBeDefined();
    expect(matched.matched).toBe(true);
    expect(matched.status.flag).toBe('agree');
    expect(matched.euName).toBe('Alpha Planet b');

    // Radius was ~1.05 R_earth (from RJup conversion) vs NASA 1.0 +/- 0.1 -> overlaps!
    expect(matched.fields.pl_rade.flag).toBe('agree');
    expect(matched.fields.pl_rade.euVal).toBeCloseTo(1.05, 2);
  });

  it('verifies that crosscatalog.json path is matched by .gitignore', () => {
    const gitignorePath = path.join(ROOT, '.gitignore');
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');

    expect(gitignoreContent).toContain('crosscatalog.json');
    expect(gitignoreContent).toContain('public/snapshots/*/crosscatalog.json');
  });
});

describe('TASK F1.1 — Safe Derived Cross-Catalog Flags & Count Reconciliation', () => {
  const flagsPath = path.join(ROOT, 'public', 'snapshots', '2026-10-30-79bb8609', 'crosscatalog-flags.json');

  it('builds derived flags with zero raw values, uncertainties, or source records', () => {
    const mockComparison = {
      meta: {
        snapshotId: 'test-id',
        generatedAt: '2026-10-31T00:00:00.000Z',
      },
      counts: {
        totalNasaPlanets: 2,
        matched: 1,
        unmatched: 1,
        statusCounts: { agree: 1, disagree: 0, notCompared: 1 },
        fieldCounts: {},
      },
      planets: {
        'planet-1': {
          planetId: 'planet-1',
          name: 'Planet 1',
          matched: true,
          euName: 'Planet 1 EU',
          status: { flag: 'agree', nasaStatus: 'confirmed', euStatus: 'Confirmed' },
          fields: {
            pl_rade: {
              flag: 'agree',
              status: 'agree',
              nasaVal: 1.0,
              euVal: 1.02,
              reason: 'Overlaps',
            },
          },
        },
        'planet-2': {
          planetId: 'planet-2',
          name: 'Planet 2',
          matched: false,
          euName: null,
          status: { flag: 'not compared', nasaStatus: 'confirmed', euStatus: null },
          fields: {
            pl_rade: {
              flag: 'not compared',
              status: 'not compared',
              nasaVal: 2.0,
              euVal: null,
              reason: 'Missing value',
            },
          },
        },
      },
    };

    const derived = buildDerivedFlags(mockComparison);

    expect(derived.meta.source).toContain('HEASARC mirror');
    expect(derived.meta.source).toContain('timed out');
    expect(derived.meta.licensingGate).toContain('SAFE DERIVED FLAGS ONLY');

    // Planet 1: matched
    const p1 = derived.planets['planet-1'];
    expect(p1.matched).toBe(true);
    expect(p1.status).toBe('agree');
    expect(p1.fields.pl_rade).toEqual({ flag: 'agree', status: 'agree' });
    expect(p1).not.toHaveProperty('euName');
    expect(p1).not.toHaveProperty('nasaVal');
    expect(p1.fields.pl_rade).not.toHaveProperty('nasaVal');
    expect(p1.fields.pl_rade).not.toHaveProperty('euVal');
    expect(p1.fields.pl_rade).not.toHaveProperty('reason');

    // Planet 2: unmatched
    const p2 = derived.planets['planet-2'];
    expect(p2.matched).toBe(false);
    expect(p2.status).toBe('not compared');
    expect(p2.fields.pl_rade).toEqual({ flag: 'not compared', status: 'not compared' });
  });

  it('reconciles snapshot counts exactly (6,451 = 5,834 matched + 617 unmatched)', () => {
    if (!fs.existsSync(flagsPath)) return;
    const flags = JSON.parse(fs.readFileSync(flagsPath, 'utf8'));

    expect(flags.counts.totalNasaPlanets).toBe(6451);
    expect(flags.counts.matched).toBe(5834);
    expect(flags.counts.unmatched).toBe(617);
    expect(flags.counts.matched + flags.counts.unmatched).toBe(6451);

    // Planet-level status reconciliation
    const { agree, disagree, notCompared } = flags.counts.statusCounts;
    expect(agree).toBe(5770);
    expect(disagree).toBe(62);
    expect(notCompared).toBe(619);
    expect(agree + disagree + notCompared).toBe(6451);

    // Identify the exact 2 matched records with status "not compared"
    const matchedNotCompared = [];
    for (const [id, p] of Object.entries(flags.planets)) {
      if (p.matched && p.status === 'not compared') {
        matchedNotCompared.push(id);
      }
    }
    expect(matchedNotCompared.sort()).toEqual(['gj-96-b', 'hd-16760-b']);
    expect(agree + disagree + matchedNotCompared.length).toBe(flags.counts.matched);
    expect(flags.counts.unmatched + matchedNotCompared.length).toBe(notCompared);
  });

  it('verifies that crosscatalog-flags.json contains zero raw numbers in planet fields', () => {
    if (!fs.existsSync(flagsPath)) return;
    const flags = JSON.parse(fs.readFileSync(flagsPath, 'utf8'));

    const samplePlanets = ['11-com-b', 'trappist-1-e', 'gj-96-b', 'hd-16760-b'];
    for (const pid of samplePlanets) {
      const p = flags.planets[pid];
      if (!p) continue;
      expect(['agree', 'disagree', 'not compared']).toContain(p.status);
      for (const [fieldName, fieldObj] of Object.entries(p.fields)) {
        expect(['agree', 'disagree', 'not compared']).toContain(fieldObj.flag);
        expect(['agree', 'disagree', 'cannot assess', 'not compared']).toContain(fieldObj.status);
        expect(fieldObj).not.toHaveProperty('nasaVal');
        expect(fieldObj).not.toHaveProperty('euVal');
        expect(fieldObj).not.toHaveProperty('e1');
        expect(fieldObj).not.toHaveProperty('e2');
      }
    }
  });
});

