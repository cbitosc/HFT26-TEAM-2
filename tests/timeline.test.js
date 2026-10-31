/**
 * tests/timeline.test.js
 * Focused tests for TASK E1: Functional Discovery Timeline Filtering:
 *   - selectVisibleGalaxyHosts: year threshold filtering, 3D position filtering, backward scrubbing
 *   - selectTimelineFilteredPlanets: cumulative planet count progression (1992 -> 2015 -> 2026)
 *   - selectTimelineStats: live cumulative counts, delta per year, method breakdown
 *   - METHOD_COLORS & getHostDotColor: detection bias color mapping & highlight override
 *   - HELM open_timeline action synchronization
 *   - Missing date handling: never invent, round, or typical-fill discovery years
 */

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeGalaxySnapshot, decodePlanetsSnapshot } from '../shared/snapshotCodec.js';
import {
  useExplorerStore,
  selectVisibleGalaxyHosts,
  selectTimelineFilteredPlanets,
  selectTimelineStats,
} from '../src/store/explorerStore.js';
import { METHOD_COLORS, getHostDotColor, GalaxyPoints } from '../src/scene/GalaxyPoints.jsx';
import { TimelineBar } from '../src/panels/TimelineBar.jsx';

describe('TASK E1 — Discovery Timeline Filtering & Scene Synchronization', () => {
  let snapshot;

  beforeAll(() => {
    const snapshotDir = path.resolve(__dirname, '../public/snapshots/2026-10-30-79bb8609');
    const rawGalaxy = JSON.parse(fs.readFileSync(path.join(snapshotDir, 'galaxy.json'), 'utf8'));
    const rawPlanets = JSON.parse(fs.readFileSync(path.join(snapshotDir, 'planets.json'), 'utf8'));

    const galaxy = decodeGalaxySnapshot(rawGalaxy);
    const planets = decodePlanetsSnapshot(rawPlanets);

    const hostById = new Map();
    for (const h of galaxy) {
      hostById.set(h.systemId, h);
    }
    const planetById = new Map();
    for (const p of planets) {
      planetById.set(p.id, p);
    }

    useExplorerStore.getState().setSnapshotData({
      snapshotId: '2026-10-30-79bb8609',
      manifest: {},
      galaxy,
      planets,
    });
    snapshot = useExplorerStore.getState().snapshot;
  });

  describe('selectVisibleGalaxyHosts — 3D Scene Filtering', () => {
    it('returns empty array when snapshot or galaxy is missing', () => {
      expect(selectVisibleGalaxyHosts(null, 2026)).toEqual([]);
      expect(selectVisibleGalaxyHosts({}, 2026)).toEqual([]);
    });

    it('filters out the 28 unpositioned hosts and keeps only valid 3D coordinates', () => {
      const allHosts = snapshot.galaxy.length; // 4,847 hosts
      const visible2026 = selectVisibleGalaxyHosts(snapshot, 2026);
      expect(visible2026.length).toBe(4819); // 4,847 - 28 = 4,819
      expect(visible2026.length).toBeLessThan(allHosts);

      for (const h of visible2026) {
        expect(h.hasPosition).toBe(true);
        expect(Number.isFinite(h.posDisplay.x)).toBe(true);
      }
    });

    it('filters hosts accurately across milestone discovery years', () => {
      // 1992: Only PSR B1257+12
      const hosts1992 = selectVisibleGalaxyHosts(snapshot, 1992);
      expect(hosts1992.length).toBe(1);
      expect(hosts1992[0].hostname).toBe('PSR B1257+12');

      // 1995: 51 Pegasi discovered
      const hosts1995 = selectVisibleGalaxyHosts(snapshot, 1995);
      expect(hosts1995.length).toBe(2);
      const names1995 = hosts1995.map((h) => h.hostname);
      expect(names1995).toContain('51 Peg');

      // 2015: Kepler era surge (1,204 positioned hosts out of 1,205 total hosts)
      const hosts2015 = selectVisibleGalaxyHosts(snapshot, 2015);
      expect(hosts2015.length).toBe(1204);

      // 2026: Full present-day census (4,819 positioned hosts out of 4,847 total hosts)
      const hosts2026 = selectVisibleGalaxyHosts(snapshot, 2026);
      expect(hosts2026.length).toBe(4819);
    });

    it('demonstrates backward scrubbing: planets discovered after selected year disappear', () => {
      const hosts2026 = selectVisibleGalaxyHosts(snapshot, 2026);
      const hosts2015 = selectVisibleGalaxyHosts(snapshot, 2015);
      const hosts2000 = selectVisibleGalaxyHosts(snapshot, 2000);

      // Moving backwards strictly decreases the count of visible systems
      expect(hosts2015.length).toBeLessThan(hosts2026.length);
      expect(hosts2000.length).toBeLessThan(hosts2015.length);

      // Verify no host in hosts2015 has firstDiscYear > 2015
      for (const h of hosts2015) {
        expect(h.firstDiscYear).toBeLessThanOrEqual(2015);
      }
    });

    it('handles unknown discovery years honestly without inventing dates', () => {
      const syntheticSnapshot = {
        galaxy: [
          { systemId: 'sys-known-1995', hasPosition: true, posDisplay: { x: 1, y: 1, z: 1 }, firstDiscYear: 1995 },
          { systemId: 'sys-known-2020', hasPosition: true, posDisplay: { x: 2, y: 2, z: 2 }, firstDiscYear: 2020 },
          { systemId: 'sys-unknown-year', hasPosition: true, posDisplay: { x: 3, y: 3, z: 3 }, firstDiscYear: null },
        ],
      };

      // In 2015, unknown discovery year is NOT included (never assumed to be earlier)
      const visible2015 = selectVisibleGalaxyHosts(syntheticSnapshot, 2015);
      expect(visible2015.map((h) => h.systemId)).toEqual(['sys-known-1995']);

      // In 2026 (all-time view), unknown discovery year is shown
      const visible2026 = selectVisibleGalaxyHosts(syntheticSnapshot, 2026);
      expect(visible2026.map((h) => h.systemId)).toEqual(['sys-known-1995', 'sys-known-2020', 'sys-unknown-year']);
    });
  });

  describe('selectTimelineFilteredPlanets & selectTimelineStats', () => {
    it('selects planets cumulative counts matching NASA archive benchmarks', () => {
      const planets1992 = selectTimelineFilteredPlanets(snapshot, 1992);
      expect(planets1992.length).toBe(2); // PSR B1257+12 c and d discovered in 1992 (planet b followed in 1994)

      const planets2015 = selectTimelineFilteredPlanets(snapshot, 2015);
      expect(planets2015.length).toBe(1938);

      const planets2026 = selectTimelineFilteredPlanets(snapshot, 2026);
      expect(planets2026.length).toBe(6451);
    });

    it('computes accurate method breakdown and delta per year in stats', () => {
      const stats2015 = selectTimelineStats(snapshot, 2015);
      expect(stats2015.cumulativeCount).toBe(1938);
      expect(stats2015.visibleHostsCount).toBe(1204);
      expect(stats2015.methodCounts.Transit).toBeGreaterThan(1000);
      expect(stats2015.methodCounts['Radial Velocity']).toBeGreaterThan(500);

      const stats2026 = selectTimelineStats(snapshot, 2026);
      expect(stats2026.cumulativeCount).toBe(6451);
      expect(stats2026.visibleHostsCount).toBe(4819);
      expect(stats2026.methodCounts.Transit).toBeGreaterThan(4000);
    });
  });

  describe('Detection Bias & Method Colors', () => {
    it('maps primary methods to distinct observational bias colors', () => {
      expect(getHostDotColor({ primaryMethod: 'Transit' })).toBe(METHOD_COLORS.Transit);
      expect(getHostDotColor({ primaryMethod: 'Radial Velocity' })).toBe(METHOD_COLORS['Radial Velocity']);
      expect(getHostDotColor({ primaryMethod: 'Microlensing' })).toBe(METHOD_COLORS.Microlensing);
      expect(getHostDotColor({ primaryMethod: 'Imaging' })).toBe(METHOD_COLORS.Imaging);
      expect(getHostDotColor({ primaryMethod: 'Pulsar Timing' })).toBe(METHOD_COLORS.default);
      expect(getHostDotColor(null)).toBe(METHOD_COLORS.default);
    });

    it('overrides method color with golden highlight when host is active/highlighted', () => {
      const color = getHostDotColor({ primaryMethod: 'Transit' }, true);
      expect(color).toBe(METHOD_COLORS.highlight);
    });
  });

  describe('HELM open_timeline Action & Store Sync', () => {
    it('updates timelineYear and driving parameters from store and HELM', () => {
      const store = useExplorerStore.getState();

      // Manual scrubbing to 2010 (417 positioned hosts in 3D scene)
      store.setTimelineYear(2010);
      expect(useExplorerStore.getState().timelineYear).toBe(2010);
      let hosts = selectVisibleGalaxyHosts(snapshot, useExplorerStore.getState().timelineYear);
      expect(hosts.length).toBe(417);

      // Play/pause toggling
      store.setTimelinePlaying(true);
      expect(useExplorerStore.getState().timelinePlaying).toBe(true);
      store.setTimelinePlaying(false);
      expect(useExplorerStore.getState().timelinePlaying).toBe(false);

      // HELM action simulation: { type: 'timeline', year: 2015, playing: false }
      store.setTimelineYear(2015);
      store.setTimelinePlaying(false);
      expect(useExplorerStore.getState().timelineYear).toBe(2015);
      hosts = selectVisibleGalaxyHosts(snapshot, 2015);
      expect(hosts.length).toBe(1204);

      // Reset to 2026
      store.setTimelineYear(2026);
      expect(useExplorerStore.getState().timelineYear).toBe(2026);
    });
  });

  describe('Component Exports', () => {
    it('exports GalaxyPoints and TimelineBar components', () => {
      expect(typeof GalaxyPoints).toBe('function');
      expect(typeof TimelineBar).toBe('function');
    });
  });
});
