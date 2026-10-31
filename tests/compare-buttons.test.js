import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { decodeGalaxySnapshot, decodePlanetsSnapshot } from '../shared/snapshotCodec.js';
import { useExplorerStore } from '../src/store/explorerStore.js';
import { resolveComparableBody } from '../src/data/referenceBodies.js';
import { sendHelmMessage } from '../src/helm/helmClient.js';
import { applyActions } from '../src/helm/applyActions.js';
import { CompareDrawer } from '../src/panels/CompareDrawer.jsx';

describe('Repair Both Compare Planets Buttons (HELM & Filters UI Interaction Paths)', () => {
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
    useExplorerStore.getState().clearHelmMessages();
  });

  describe('Filters Interface Compare Interaction Path', () => {
    it('does not select arbitrary planets when compare is empty', () => {
      const store = useExplorerStore.getState();
      expect(store.compareIds).toEqual([]);
      expect(store.compareOpen).toBe(false);

      // Adding single planet from list must add ONLY that planet (never inject Earth)
      store.addCompareId('trappist-1-e');
      expect(useExplorerStore.getState().compareIds).toEqual(['trappist-1-e']);
      expect(useExplorerStore.getState().compareIds.length).toBe(1);
    });

    it('populates compare tray and opens drawer when 2 planets are selected', () => {
      const store = useExplorerStore.getState();
      store.addCompareId('trappist-1-e');
      store.addCompareId('proxima-cen-b');

      expect(useExplorerStore.getState().compareIds).toEqual(['trappist-1-e', 'proxima-cen-b']);
      expect(useExplorerStore.getState().compareOpen).toBe(true);

      const resolved = useExplorerStore.getState().compareIds.map((id) => resolveComparableBody(id, snapshot));
      expect(resolved.length).toBe(2);
      expect(resolved[0].name).toBe('TRAPPIST-1 e');
      expect(resolved[1].name).toBe('Proxima Cen b');
    });

    it('preserves the strict 3-planet limit and add/remove functionality', () => {
      const store = useExplorerStore.getState();
      store.addCompareId('trappist-1-e');
      store.addCompareId('proxima-cen-b');
      store.addCompareId('earth');
      expect(useExplorerStore.getState().compareIds.length).toBe(3);

      // Adding 4th replaces oldest
      store.addCompareId('jupiter');
      expect(useExplorerStore.getState().compareIds.length).toBe(3);
      expect(useExplorerStore.getState().compareIds).toEqual(['proxima-cen-b', 'earth', 'jupiter']);

      // Removing one leaves 2
      store.removeCompareId('earth');
      expect(useExplorerStore.getState().compareIds).toEqual(['proxima-cen-b', 'jupiter']);
      expect(useExplorerStore.getState().compareOpen).toBe(true);
    });
  });

  describe('HELM Interface Compare Interaction Path', () => {
    it('executes canned query #3 ("Compare TRAPPIST-1 e with Earth") and opens comparison drawer', async () => {
      const store = useExplorerStore.getState();
      expect(store.compareIds).toEqual([]);
      expect(store.compareOpen).toBe(false);

      const result = await sendHelmMessage('Compare TRAPPIST-1 e with Earth.', {
        store: useExplorerStore.getState(),
        preferLocalCanned: true,
      });

      expect(result.response.meta.source).toBe('canned');
      expect(result.response.actions).toContainEqual({
        type: 'open_compare',
        ids: ['trappist-1-e', 'earth'],
      });

      // Synchronized into explorer store state
      const state = useExplorerStore.getState();
      expect(state.compareIds).toEqual(['trappist-1-e', 'earth']);
      expect(state.compareOpen).toBe(true);
    });

    it('executes open_compare action pill click handler correctly', () => {
      const store = useExplorerStore.getState();
      const action = { type: 'open_compare', ids: ['proxima-cen-b', 'earth'] };

      applyActions([action], useExplorerStore);

      const state = useExplorerStore.getState();
      expect(state.compareIds).toEqual(['proxima-cen-b', 'earth']);
      expect(state.compareOpen).toBe(true);

      const bodies = state.compareIds.map((id) => resolveComparableBody(id, snapshot));
      expect(bodies.length).toBe(2);
      expect(bodies[0].name).toBe('Proxima Cen b');
      expect(bodies[1].name).toBe('Earth (Reference)');
    });

    it('synchronizes between HELM and Filters through single store comparison state', () => {
      const store = useExplorerStore.getState();

      // Selected from Filters
      store.addCompareId('trappist-1-e');

      // Then supplemented or triggered from HELM
      store.addCompareId('earth');

      expect(useExplorerStore.getState().compareIds).toEqual(['trappist-1-e', 'earth']);
      expect(useExplorerStore.getState().compareOpen).toBe(true);
    });

    it('renders CompareDrawer safely without throwing or going blank in all states', () => {
      const store = useExplorerStore.getState();

      // State 1: 0 planets open
      store.setCompareIds([]);
      store.setCompareOpen(true);
      expect(() => renderToString(React.createElement(CompareDrawer))).not.toThrow();

      // State 2: 1 planet open
      store.addCompareId('trappist-1-e');
      expect(() => renderToString(React.createElement(CompareDrawer))).not.toThrow();

      // State 3: 2 planets open (exoplanet + reference Earth)
      store.addCompareId('earth');
      expect(() => renderToString(React.createElement(CompareDrawer))).not.toThrow();

      // State 4: 3 planets open + Scientist Mode enabled
      store.addCompareId('jupiter');
      store.setScientistMode(true);
      console.log('DEBUG store state:', {
        compareIds: useExplorerStore.getState().compareIds,
        compareOpen: useExplorerStore.getState().compareOpen,
      });
      const html3 = renderToString(React.createElement(CompareDrawer));
      expect(html3).toContain('VERSUS');
      expect(html3).toContain('TRAPPIST-1 e');
      expect(html3).toContain('Earth (Reference)');
      expect(html3).toContain('Jupiter (Reference)');
    });
  });
});

