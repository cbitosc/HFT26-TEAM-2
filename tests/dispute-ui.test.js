/**
 * tests/dispute-ui.test.js
 * Focused tests for TASK C2: DISPUTE Scientific Strip Plot and UI integration:
 *   - `DisputeStripPlot` export and 5 supported parameter fields
 *   - Lazy solutions loader: `loadPlanetSolutions`, `getSolutionsForPlanet`, `loadSolutions`
 *   - Decodes and preserves individual published solutions without averaging
 *   - Accurately distinguishes limit bounds and missing uncertainties
 *   - Preserves source references, publication dates, and adopted default markers
 *   - Reconciles multi-solution literature scope (5,505 of 6,451 confirmed planets)
 *   - Graceful fallback for legacy snapshots without solutions
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  DisputeStripPlot,
  DISPUTE_PLOT_FIELDS,
} from '../src/panels/DisputeStripPlot.jsx';
import {
  DisputePanel,
  usePlanetSolutions,
} from '../src/panels/DisputePanel.jsx';
import {
  loadSolutions,
  loadPlanetSolutions,
  getSolutionsForPlanet,
  getCachedSolutionsData,
} from '../src/data/loadSnapshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('TASK C2 — DISPUTE Scientific Strip Plot & Solutions UI Integration', () => {
  const snapshotId = '2026-10-30-79bb8609';

  beforeEach(async () => {
    globalThis.fetch = async (url) => {
      const cleanPath = url.replace(/^\/?snapshots\//, '');
      const filePath = path.join(ROOT, 'public', 'snapshots', cleanPath);
      if (fs.existsSync(filePath)) {
        const text = fs.readFileSync(filePath, 'utf8');
        return {
          ok: true,
          status: 200,
          json: async () => JSON.parse(text),
        };
      }
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      };
    };

    await loadSolutions(snapshotId);
  });

  describe('Component Exports & Supported Fields', () => {
    it('exports DisputeStripPlot and all 5 architecture-defined parameter fields', () => {
      expect(DisputeStripPlot).toBeDefined();
      expect(typeof DisputeStripPlot).toBe('function');

      const fieldKeys = DISPUTE_PLOT_FIELDS.map((f) => f.key);
      expect(fieldKeys).toEqual([
        'pl_rade',
        'pl_bmasse',
        'pl_orbper',
        'pl_eqt',
        'st_teff',
      ]);
    });

    it('exports DisputePanel and usePlanetSolutions hook', () => {
      expect(DisputePanel).toBeDefined();
      expect(typeof DisputePanel).toBe('function');
      expect(usePlanetSolutions).toBeDefined();
      expect(typeof usePlanetSolutions).toBe('function');
    });
  });

  describe('Lazy Solutions Loading & Snapshot Integration (src/data/loadSnapshot.js)', () => {
    it('loads and caches solutions.json from the active snapshot lazily', async () => {
      const cached = getCachedSolutionsData();
      expect(cached).not.toBeNull();
      expect(cached.snapshotId).toBe(snapshotId);
      expect(cached.version).toBe(1);
      expect(Array.isArray(cached.refs)).toBe(true);
      expect(cached.refs.length).toBeGreaterThan(1000);
      expect(Object.keys(cached.planets).length).toBe(6451);
    });

    it('retrieves and decodes individual solutions for a planet without averaging', async () => {
      const trappistSols = await loadPlanetSolutions(snapshotId, 'trappist-1-e');
      expect(trappistSols).not.toBeNull();

      // Check all 5 fields exist for TRAPPIST-1 e
      for (const fieldKey of ['pl_rade', 'pl_bmasse', 'pl_orbper', 'pl_eqt', 'st_teff']) {
        expect(Array.isArray(trappistSols[fieldKey])).toBe(true);
        expect(trappistSols[fieldKey].length).toBeGreaterThanOrEqual(1);
      }

      // Check pl_rade has multiple distinct published solutions (not averaged away)
      const radSols = trappistSols.pl_rade;
      expect(radSols.length).toBeGreaterThanOrEqual(2);

      const distinctVals = new Set(radSols.map((s) => s.v));
      expect(distinctVals.size).toBeGreaterThanOrEqual(2);

      // Verify structure of decoded solutions
      const sample = radSols[0];
      expect(typeof sample.v).toBe('number');
      expect(Number.isFinite(sample.v)).toBe(true);
      expect(sample.ref).not.toBeNull();
      expect(typeof sample.default).toBe('boolean');

      // Exactly one default solution should be flagged
      const defaultSols = radSols.filter((s) => s.default);
      expect(defaultSols.length).toBe(1);
    });

    it('faithfully preserves limits and missing uncertainties', async () => {
      // Find a planet with limit or missing error in solutions
      const cached = getCachedSolutionsData();
      let foundLimit = false;
      let foundMissingErr = false;

      for (const planetId of Object.keys(cached.planets).slice(0, 50)) {
        const sols = getSolutionsForPlanet(planetId);
        for (const fieldList of Object.values(sols)) {
          for (const s of fieldList) {
            if (s.lim === 1 || s.lim === -1) foundLimit = true;
            if (s.e1 === null || s.e2 === null) foundMissingErr = true;
          }
        }
        if (foundLimit && foundMissingErr) break;
      }

      expect(foundLimit).toBe(true);
      expect(foundMissingErr).toBe(true);
    });

    it('gracefully returns null for legacy snapshots without solutions without throwing', async () => {
      const legacyResult = await loadSolutions('legacy-snapshot-without-solutions');
      expect(legacyResult).toBeNull();

      const planetResult = getSolutionsForPlanet('non-existent-planet');
      expect(planetResult).toBeNull();
    });
  });

  describe('Multi-Solution Literature Count Reconciliation (Requirement 11)', () => {
    it('verifies the mathematical reconciliation of multi-solution vs confirmed planets', () => {
      const cached = getCachedSolutionsData();
      const allPlanetIds = Object.keys(cached.planets);

      expect(allPlanetIds.length).toBe(6451); // Denominator: 100% of confirmed planets

      // Count multi-solution planets (>= 2 solutions in at least 1 field)
      let multiSolutionCount = 0;
      for (const id of allPlanetIds) {
        const rawFields = cached.planets[id];
        const hasMulti = Object.values(rawFields).some((arr) => arr.length >= 2);
        if (hasMulti) multiSolutionCount++;
      }

      expect(multiSolutionCount).toBe(5505);
      const multiPct = (multiSolutionCount / 6451) * 100;
      expect(multiPct).toBeCloseTo(85.33, 1);
    });
  });
});
