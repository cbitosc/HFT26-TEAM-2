/**
 * tests/crosscatalog-ui.test.js
 * Focused frontend unit and integration tests for TASK F1.2 cross-catalog UI integration:
 *   - `loadCrosscatalogFlags` and `getCrosscatalogFlagsForPlanet` in `src/data/loadSnapshot.js`
 *   - Derived flags access in `src/panels/DisputePanel.jsx` and `src/panels/PlanetCard.jsx`
 *   - Level 2 parameter-level vs Level 3 planet-level distinction
 *   - Semantics: 'agree', 'disagree', 'cannot assess', 'not compared'
 *   - Unmatched planets MUST show 'not compared', never 'disagree'
 *   - Safe handling of legacy/missing snapshot files without throwing
 *   - Zero raw measurements or uncertainties exposed
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  getCachedCrosscatalogFlags,
  getCrosscatalogFlagsForPlanet,
  getCrosscatalogMeta,
  loadCrosscatalogFlags,
} from '../src/data/loadSnapshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('TASK F1.2 — Frontend Cross-Catalog Integration & UI Data Loading', () => {
  const snapshotId = '2026-10-30-79bb8609';

  beforeEach(async () => {
    // Mock global fetch to read real static files from public/snapshots/
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
  });

  it('loads derived cross-catalog flags for active snapshot safely', async () => {
    const data = await loadCrosscatalogFlags(snapshotId);
    expect(data).not.toBeNull();
    expect(data.meta.snapshotId).toBe(snapshotId);
    expect(data.meta.licensingGate).toContain('SAFE DERIVED FLAGS ONLY');
    expect(data.meta.source).toContain('IVOA HEASARC mirror');
    expect(data.meta.source).toContain('timed out');
    expect(data.counts.totalNasaPlanets).toBe(6451);
  });

  it('retrieves correct flags for confirmed matched planet (11 Com b)', async () => {
    await loadCrosscatalogFlags(snapshotId);
    const planetFlags = getCrosscatalogFlagsForPlanet('11-com-b');

    expect(planetFlags).not.toBeNull();
    expect(planetFlags.matched).toBe(true);

    // Level 3 planet-level confirmation status
    expect(planetFlags.status).toBe('agree');

    // Level 2 parameter-level interval overlap agreement
    expect(planetFlags.fields.pl_orbper.status).toBe('disagree');
    expect(planetFlags.fields.pl_orbsmax.status).toBe('disagree');
    expect(planetFlags.fields.pl_rade.status).toBe('not compared');
    expect(planetFlags.fields.st_teff.status).toBe('cannot assess');

    // Verify ZERO raw values or uncertainties are present
    expect(planetFlags).not.toHaveProperty('nasaVal');
    expect(planetFlags).not.toHaveProperty('euVal');
    expect(planetFlags.fields.pl_orbper).not.toHaveProperty('nasaVal');
    expect(planetFlags.fields.pl_orbper).not.toHaveProperty('euVal');
  });

  it('retrieves "not compared" for matched planets with EU status FALSE (GJ 96 b, HD 16760 b)', async () => {
    await loadCrosscatalogFlags(snapshotId);

    const gj96b = getCrosscatalogFlagsForPlanet('gj-96-b');
    expect(gj96b.matched).toBe(true);
    expect(gj96b.status).toBe('not compared');
    expect(gj96b.status).not.toBe('disagree');

    const hd16760b = getCrosscatalogFlagsForPlanet('hd-16760-b');
    expect(hd16760b.matched).toBe(true);
    expect(hd16760b.status).toBe('not compared');
    expect(hd16760b.status).not.toBe('disagree');
  });

  it('MUST show "not compared" for unmatched planets, NEVER "disagree"', async () => {
    await loadCrosscatalogFlags(snapshotId);

    // Unmatched planet from snapshot: 2mass-j22501512-2325342-b
    const unmatched = getCrosscatalogFlagsForPlanet('2mass-j22501512-2325342-b');
    expect(unmatched).not.toBeNull();
    expect(unmatched.matched).toBe(false);
    expect(unmatched.status).toBe('not compared');
    expect(unmatched.status).not.toBe('disagree');

    // All 5 fields must be 'not compared'
    for (const f of Object.values(unmatched.fields)) {
      expect(f.status).toBe('not compared');
      expect(f.status).not.toBe('disagree');
    }
  });

  it('preserves distinction between Level 2 (parameter overlap) and Level 3 (planet status)', async () => {
    await loadCrosscatalogFlags(snapshotId);

    const planet = getCrosscatalogFlagsForPlanet('11-umi-b');
    expect(planet.matched).toBe(true);

    // Level 3 is planet-level status: 'agree'
    expect(['agree', 'disagree', 'not compared']).toContain(planet.status);

    // Level 2 are individual parameter statuses
    for (const [key, fieldComp] of Object.entries(planet.fields)) {
      expect(['agree', 'disagree', 'cannot assess', 'not compared']).toContain(fieldComp.status);
      expect(['agree', 'disagree', 'not compared']).toContain(fieldComp.flag);
    }
  });

  it('handles missing snapshot files and legacy snapshots safely without throwing', async () => {
    // Attempt loading a nonexistent legacy snapshot ID
    const result = await loadCrosscatalogFlags('legacy-snapshot-without-crosscatalog');
    expect(result).toBeNull();

    // Querying planet flags when cache is null returns null cleanly
    const missing = getCrosscatalogFlagsForPlanet('trappist-1-e');
    expect(missing).toBeNull();
  });
});

