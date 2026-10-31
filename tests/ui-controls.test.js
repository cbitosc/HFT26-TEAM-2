/**
 * tests/ui-controls.test.js
 * Unit and store-integration tests for the non-3D frontend controls:
 *   - `REFERENCE_BODIES` & `resolveComparableBody` (`src/data/referenceBodies.js`)
 *   - Multi-criteria `filters` + `applyFilters` (`FilterDrawer.jsx` logic)
 *   - `timelineYear` cumulative discovery counting (`1,945` <= 2015, `6,451` <= 2026)
 *   - `compareIds` side-by-side resolution (`['trappist-1-e', 'earth']`)
 *   - `scientistMode` state toggle
 *   - `HelmDock` / `sendHelmMessage` execution of all 5 canonical canned queries
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getServerSnapshot } from '../server/helm/snapshotStore.js';
import { applyFilters } from '../shared/filters.js';
import { useExplorerStore } from '../src/store/explorerStore.js';
import {
  REFERENCE_BODIES,
  SOLAR_SYSTEM_REFERENCE_REF,
  resolveComparableBody,
} from '../src/data/referenceBodies.js';
import { CANNED_QUERIES } from '../src/helm/cannedQueries.js';
import { sendHelmMessage } from '../src/helm/helmClient.js';

describe('Non-3D UI Controls & Store Integration (Snapshot 2026-10-30-79bb8609)', () => {
  const snapshot = getServerSnapshot();

  beforeEach(() => {
    const state = useExplorerStore.getState();
    state.setSnapshotData({
      snapshotId: snapshot.snapshotId,
      manifest: snapshot.manifest,
      galaxy: snapshot.galaxy,
      planets: snapshot.planets,
    });
    state.selectGalaxy();
    state.setFilters({});
    state.setHighlightIds([]);
    state.setTimelineYear(2026);
    state.setTimelinePlaying(false);
    state.setCompareIds([]);
    state.setScientistMode(false);
    state.clearHelmMessages();
  });

  it('resolves Solar System reference bodies (earth, jupiter) with type="reference" and snapshot exoplanets', () => {
    const earth = resolveComparableBody('earth', snapshot);
    const jupiter = resolveComparableBody('JUPITER', snapshot);
    const trappist1e = resolveComparableBody('trappist-1-e', snapshot);
    const proximaCenB = resolveComparableBody('proxima-cen-b', snapshot);
    const missing = resolveComparableBody('nonexistent-planet-xyz', snapshot);

    expect(earth).toBe(REFERENCE_BODIES.earth);
    expect(earth.type).toBe('reference');
    expect(earth.status).toBe('reference');
    expect(earth.fields.pl_rade.v).toBe(1.0);
    expect(earth.fields.pl_rade.type).toBe('reference');
    expect(earth.fields.pl_rade.ref).toEqual(SOLAR_SYSTEM_REFERENCE_REF);
    expect(earth.fields.sy_dist.v).toBeNull(); // Never zero-filled

    expect(jupiter).toBe(REFERENCE_BODIES.jupiter);
    expect(jupiter.type).toBe('reference');
    expect(jupiter.fields.pl_rade.v).toBeCloseTo(11.209, 3);
    expect(jupiter.fields.pl_bmasse.v).toBeCloseTo(317.83, 2);
    expect(jupiter.fields.pl_bmasse.type).toBe('reference');

    expect(trappist1e).not.toBeNull();
    expect(trappist1e.id).toBe('trappist-1-e');
    expect(trappist1e.hostname).toBe('TRAPPIST-1');
    expect(trappist1e.fields.pl_rade.v).toBeCloseTo(0.92, 2);

    expect(proximaCenB).not.toBeNull();
    expect(proximaCenB.id).toBe('proxima-cen-b');
    expect(proximaCenB.fields.sy_dist.v).toBeCloseTo(1.30119, 5);

    expect(missing).toBeNull();
  });

  it('integrates multi-criteria filters (HZ, radiusEarth, method) and highlightIds in explorerStore', () => {
    const store = useExplorerStore.getState();

    // Filter for Earth-sized (0.8-1.25 R_earth) planets in the optimistic habitable zone
    store.setFilters({
      hz: 'in_optimistic',
      radiusEarth: { min: 0.8, max: 1.25 },
      sortBy: 'distance',
      sortDir: 'asc',
    });

    const activeFilters = useExplorerStore.getState().filters;
    const matched = applyFilters(snapshot.planets, activeFilters);

    expect(matched.length).toBeGreaterThan(10);
    expect(matched.some((p) => p.id === 'gj-1002-b' || p.id === 'proxima-cen-b')).toBe(true);

    for (const p of matched) {
      expect(p.fields.pl_rade.v).toBeGreaterThanOrEqual(0.8);
      expect(p.fields.pl_rade.v).toBeLessThanOrEqual(1.25);
      expect(['in_conservative', 'in_optimistic_only']).toContain(p.hab.hzPosition.status);
    }

    // Highlight top 50 matched planets in 3D
    const topIds = matched.slice(0, 50).map((p) => p.id);
    store.setHighlightIds(topIds);
    expect(useExplorerStore.getState().highlightIds).toEqual(topIds);

    // Phase 1a honest dispute availability check
    const hasDisputeData = snapshot.planets.some((p) => p.dispute?.available === true);
    expect(hasDisputeData).toBe(false);
  });

  it('computes exact cumulative discovery counts for timelineYear (1,938 <= 2015 and 6,451 <= 2026)', () => {
    const store = useExplorerStore.getState();

    store.setTimelineYear(2015);
    expect(useExplorerStore.getState().timelineYear).toBe(2015);

    const discoveredBy2015 = snapshot.planets.filter(
      (p) => p.discovery?.year !== null && p.discovery.year <= 2015
    );
    expect(discoveredBy2015.length).toBe(1938);

    store.setTimelineYear(2026);
    const discoveredBy2026 = snapshot.planets.filter(
      (p) => p.discovery?.year !== null && p.discovery.year <= 2026
    );
    expect(discoveredBy2026.length).toBe(6451);
  });

  it('manages compareIds (up to 3 bodies) and scientistMode in explorerStore', () => {
    const store = useExplorerStore.getState();

    expect(store.scientistMode).toBe(false);
    store.setScientistMode(true);
    expect(useExplorerStore.getState().scientistMode).toBe(true);

    store.setCompareIds(['trappist-1-e', 'earth']);
    expect(useExplorerStore.getState().compareIds).toEqual(['trappist-1-e', 'earth']);

    const resolved = useExplorerStore
      .getState()
      .compareIds.map((id) => resolveComparableBody(id, snapshot));
    expect(resolved).toHaveLength(2);
    expect(resolved[0].id).toBe('trappist-1-e');
    expect(resolved[1].id).toBe('earth');

    // Enforces max 3 bodies in compareIds
    store.setCompareIds(['trappist-1-e', 'proxima-cen-b', 'earth', 'jupiter']);
    expect(useExplorerStore.getState().compareIds).toEqual([
      'trappist-1-e',
      'proxima-cen-b',
      'earth',
    ]);
  });

  it('executes all 5 canonical canned queries via sendHelmMessage (preferLocalCanned: true) and updates store state', async () => {
    expect(CANNED_QUERIES).toHaveLength(5);

    for (const cq of CANNED_QUERIES) {
      const { response, actionResult } = await sendHelmMessage(cq.prompt, {
        store: useExplorerStore,
        preferLocalCanned: true,
      });

      expect(response.meta.source).toBe('canned');
      expect(response.meta.model).toBe('deterministic-canned');
      expect(response.segments.length).toBeGreaterThan(0);
      expect(actionResult.rejected).toHaveLength(0);
      expect(actionResult.applied.length).toBeGreaterThan(0);
    }

    // Verify transcript has 5 user + 5 assistant messages = 10 messages
    const stateAfterAll = useExplorerStore.getState();
    expect(stateAfterAll.helm.messages).toHaveLength(10);
    expect(stateAfterAll.helm.status).toBe('canned');

    // Last query (#5) focuses Proxima Cen b
    expect(stateAfterAll.selectedPlanetId).toBe('proxima-cen-b');
    expect(stateAfterAll.viewLevel).toBe('planet');
  });
});
