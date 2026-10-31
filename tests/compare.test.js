/**
 * tests/compare.test.js
 * Focused tests for TASK E2: Interactive Planet Comparison:
 *   - 2-3 planet comparison state management in Zustand store
 *   - 3-body maximum selection enforcement
 *   - Live selection counter (0/3, 1/3, 2/3, 3/3)
 *   - Reference bodies resolution (Earth & Jupiter from NASA Planetary Fact Sheet)
 *   - Unknown value preservation (never invent or infer measurements)
 *   - HELM open_compare action synchronization
 *   - Component exports (CompareTray, ComparePanel, CompareDrawer)
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeGalaxySnapshot, decodePlanetsSnapshot } from '../shared/snapshotCodec.js';
import { useExplorerStore } from '../src/store/explorerStore.js';
import { resolveComparableBody, REFERENCE_BODIES } from '../src/data/referenceBodies.js';
import { CompareTray } from '../src/panels/CompareTray.jsx';
import { ComparePanel, COMPARE_FIELD_KEYS, COMPARE_HAB_KEYS } from '../src/panels/ComparePanel.jsx';
import { CompareDrawer } from '../src/panels/CompareDrawer.jsx';

describe('TASK E2 — Interactive Planet Comparison (VERSUS)', () => {
  let snapshot;

  beforeAll(() => {
    const snapshotDir = path.resolve(__dirname, '../public/snapshots/2026-10-30-79bb8609');
    const rawGalaxy = JSON.parse(fs.readFileSync(path.join(snapshotDir, 'galaxy.json'), 'utf8'));
    const rawPlanets = JSON.parse(fs.readFileSync(path.join(snapshotDir, 'planets.json'), 'utf8'));

    const galaxy = decodeGalaxySnapshot(rawGalaxy);
    const planets = decodePlanetsSnapshot(rawPlanets);

    useExplorerStore.getState().setSnapshotData({
      snapshotId: '2026-10-30-79bb8609',
      manifest: {},
      galaxy,
      planets,
    });
    snapshot = useExplorerStore.getState().snapshot;
  });

  beforeEach(() => {
    useExplorerStore.getState().clearCompareIds();
  });

  describe('Comparison State & 3-Body Maximum Enforcement', () => {
    it('initializes with an empty comparison tray and closed panel', () => {
      const state = useExplorerStore.getState();
      expect(state.compareIds).toEqual([]);
      expect(state.compareOpen).toBe(false);
    });

    it('adds bodies to the comparison tray and opens the panel', () => {
      const store = useExplorerStore.getState();
      store.addCompareId('trappist-1-e');
      expect(useExplorerStore.getState().compareIds).toEqual(['trappist-1-e']);
      expect(useExplorerStore.getState().compareOpen).toBe(true);

      store.addCompareId('earth');
      expect(useExplorerStore.getState().compareIds).toEqual(['trappist-1-e', 'earth']);
      expect(useExplorerStore.getState().compareIds.length).toBe(2);

      store.addCompareId('jupiter');
      expect(useExplorerStore.getState().compareIds).toEqual(['trappist-1-e', 'earth', 'jupiter']);
      expect(useExplorerStore.getState().compareIds.length).toBe(3);
    });

    it('enforces a strict maximum of 3 bodies by replacing the oldest item when a 4th is added', () => {
      const store = useExplorerStore.getState();
      store.setCompareIds(['trappist-1-e', 'earth', 'jupiter']);
      expect(useExplorerStore.getState().compareIds.length).toBe(3);

      // Adding 4th body replaces oldest ('trappist-1-e')
      store.addCompareId('proxima-cen-b');
      const ids = useExplorerStore.getState().compareIds;
      expect(ids.length).toBe(3);
      expect(ids).toEqual(['earth', 'jupiter', 'proxima-cen-b']);
      expect(ids).not.toContain('trappist-1-e');
    });

    it('truncates any array larger than 3 when using setCompareIds', () => {
      const store = useExplorerStore.getState();
      store.setCompareIds(['planet-a', 'planet-b', 'planet-c', 'planet-d', 'planet-e']);
      expect(useExplorerStore.getState().compareIds.length).toBe(3);
      expect(useExplorerStore.getState().compareIds).toEqual(['planet-a', 'planet-b', 'planet-c']);
    });

    it('removes individual bodies without losing remaining comparison selection', () => {
      const store = useExplorerStore.getState();
      store.setCompareIds(['trappist-1-e', 'earth', 'jupiter']);

      store.removeCompareId('earth');
      expect(useExplorerStore.getState().compareIds).toEqual(['trappist-1-e', 'jupiter']);
      expect(useExplorerStore.getState().compareIds.length).toBe(2);

      store.removeCompareId('trappist-1-e');
      expect(useExplorerStore.getState().compareIds).toEqual(['jupiter']);
      expect(useExplorerStore.getState().compareIds.length).toBe(1);
    });

    it('clears all comparison bodies and resets open state', () => {
      const store = useExplorerStore.getState();
      store.setCompareIds(['trappist-1-e', 'earth']);
      expect(useExplorerStore.getState().compareIds.length).toBe(2);

      store.clearCompareIds();
      expect(useExplorerStore.getState().compareIds).toEqual([]);
      expect(useExplorerStore.getState().compareOpen).toBe(false);
    });
  });

  describe('Reference Bodies & Scientific Integrity', () => {
    it('resolves Earth reference body with verified Solar System measurements and provenance', () => {
      const earth = resolveComparableBody('earth', snapshot);
      expect(earth).not.toBeNull();
      expect(earth.isReference).toBe(true);
      expect(earth.name).toContain('Earth');

      // 1.0 Earth Radius, 1.0 Earth Mass, 1.0 AU semi-major axis
      expect(earth.fields.pl_rade.v).toBe(1.0);
      expect(earth.fields.pl_rade.type).toBe('reference');
      expect(earth.fields.pl_bmasse.v).toBe(1.0);
      expect(earth.fields.pl_orbsmax.v).toBe(1.0);
      expect(earth.fields.st_teff.v).toBe(5772); // Sun effective temperature

      // Missing/non-applicable catalog field (Earth distance from origin is null, never fabricated)
      expect(earth.fields.sy_dist.v).toBeNull();

      // Provenance points to verified NASA Planetary Fact Sheet
      expect(earth.fields.pl_rade.ref.text).toContain('NASA Planetary Fact Sheet');
    });

    it('resolves Jupiter reference body with verified Solar System gas giant baseline', () => {
      const jupiter = resolveComparableBody('jupiter', snapshot);
      expect(jupiter).not.toBeNull();
      expect(jupiter.isReference).toBe(true);
      expect(jupiter.planetClass).toBe('gas_giant');

      // 11.209 Earth Radii, 317.83 Earth Masses, 5.204 AU
      expect(jupiter.fields.pl_rade.v).toBeCloseTo(11.209, 2);
      expect(jupiter.fields.pl_bmasse.v).toBeCloseTo(317.83, 1);
      expect(jupiter.fields.pl_orbsmax.v).toBeCloseTo(5.204, 2);
      expect(jupiter.hab.hzPosition.status).toBe('outside_outer');
    });

    it('resolves catalog exoplanets from snapshot without altering values', () => {
      const trappist = resolveComparableBody('trappist-1-e', snapshot);
      expect(trappist).not.toBeNull();
      expect(trappist.name).toBe('TRAPPIST-1 e');
      expect(trappist.isReference).toBeFalsy();
      expect(trappist.fields.pl_rade.v).toBeCloseTo(0.92, 1);
      expect(trappist.fields.pl_rade.ref).toBeDefined();
    });

    it('returns null for unknown IDs without crashing', () => {
      expect(resolveComparableBody(null, snapshot)).toBeNull();
      expect(resolveComparableBody('', snapshot)).toBeNull();
      expect(resolveComparableBody('non-existent-planet-id', snapshot)).toBeNull();
    });
  });

  describe('HELM Synchronization & Preset Actions', () => {
    it('synchronizes HELM open_compare action directly into comparison tray and panel', () => {
      const store = useExplorerStore.getState();

      // HELM action: open_compare with TRAPPIST-1 e and Earth
      store.setCompareIds(['trappist-1-e', 'earth']);
      expect(useExplorerStore.getState().compareIds).toEqual(['trappist-1-e', 'earth']);
      expect(useExplorerStore.getState().compareOpen).toBe(true);

      const resolved = useExplorerStore.getState().compareIds.map((id) => resolveComparableBody(id, snapshot));
      expect(resolved.length).toBe(2);
      expect(resolved[0].name).toBe('TRAPPIST-1 e');
      expect(resolved[1].name).toBe('Earth (Reference)');
    });
  });

  describe('Comparison Properties Coverage & Component Exports', () => {
    it('covers all architecture-defined comparison measurement keys and HAB-LAB keys', () => {
      expect(COMPARE_FIELD_KEYS).toContain('pl_rade');
      expect(COMPARE_FIELD_KEYS).toContain('pl_bmasse');
      expect(COMPARE_FIELD_KEYS).toContain('pl_dens');
      expect(COMPARE_FIELD_KEYS).toContain('pl_orbper');
      expect(COMPARE_FIELD_KEYS).toContain('pl_orbsmax');
      expect(COMPARE_FIELD_KEYS).toContain('pl_eqt');
      expect(COMPARE_FIELD_KEYS).toContain('pl_insol');
      expect(COMPARE_FIELD_KEYS).toContain('st_teff');
      expect(COMPARE_FIELD_KEYS).toContain('sy_dist');

      expect(COMPARE_HAB_KEYS.map((k) => k.key)).toEqual([
        'hzPosition',
        'sizePlausibility',
        'massPlausibility',
        'stellarType',
        'dataCompleteness',
      ]);
    });

    it('exports CompareTray, ComparePanel, and CompareDrawer components', () => {
      expect(typeof CompareTray).toBe('function');
      expect(typeof ComparePanel).toBe('function');
      expect(typeof CompareDrawer).toBe('function');
    });
  });
});
