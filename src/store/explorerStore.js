/**
 * src/store/explorerStore.js
 * Single source of truth Zustand store for the Team Tetris Exoplanet Explorer.
 *
 * Single-writer shared file owned by Reviewer / Integrator (AGENTS.md Section 2).
 * Frozen interface for Phase 2 app shell and 3D scene integration.
 */

import { create } from 'zustand';

let cameraSeq = 1;

function nextCameraRequest(level, targetId = null) {
  cameraSeq += 1;
  return {
    level,
    targetId,
    seq: cameraSeq,
  };
}

export const useExplorerStore = create((set, get) => ({
  // Snapshot loading & data state
  snapshotStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  snapshotError: null,
  snapshot: null, // { snapshotId, manifest, galaxy, planets, hostById, planetById, planetsBySystemId }

  // Navigation & selection state (ARCHITECTURE.md Section 7)
  viewLevel: 'galaxy', // 'galaxy' | 'system' | 'planet'
  selectedSystemId: null,
  selectedPlanetId: null,
  hoverId: null,

  // Search, filter, highlight, timeline, compare, and display modes
  searchQuery: '',
  filters: {},
  highlightIds: [],
  timelineYear: 2026,
  timelinePlaying: false,
  compareIds: [],
  compareOpen: false,
  scientistMode: false,
  orbitSpeed: 1.0,

  // HELM state (explicitly marked unavailable until HELM phase is wired)
  helm: {
    messages: [],
    status: 'unavailable',
  },

  // Camera director request queue item
  cameraRequest: null,

  // ─── Actions ───────────────────────────────────────────────────────────────

  setSnapshotLoading: () =>
    set({
      snapshotStatus: 'loading',
      snapshotError: null,
    }),

  setSnapshotError: (errorMessage) =>
    set({
      snapshotStatus: 'error',
      snapshotError: String(errorMessage || 'Failed to load snapshot'),
    }),

  setSnapshotData: ({ snapshotId, manifest, galaxy, planets }) => {
    const hostById = new Map();
    for (const h of galaxy) {
      hostById.set(h.systemId, h);
    }

    const planetById = new Map();
    const planetsBySystemId = new Map();
    for (const p of planets) {
      planetById.set(p.id, p);
      if (!planetsBySystemId.has(p.systemId)) {
        planetsBySystemId.set(p.systemId, []);
      }
      planetsBySystemId.get(p.systemId).push(p);
    }

    set({
      snapshotStatus: 'ready',
      snapshotError: null,
      snapshot: {
        snapshotId,
        manifest,
        galaxy,
        planets,
        hostById,
        planetById,
        planetsBySystemId,
      },
    });
  },

  selectGalaxy: () =>
    set({
      viewLevel: 'galaxy',
      selectedSystemId: null,
      selectedPlanetId: null,
      hoverId: null,
      cameraRequest: nextCameraRequest('galaxy', null),
    }),

  selectSystem: (systemId) => {
    const snap = get().snapshot;
    if (!systemId || (snap && !snap.hostById.has(systemId))) {
      return;
    }
    set({
      viewLevel: 'system',
      selectedSystemId: systemId,
      selectedPlanetId: null,
      hoverId: null,
      cameraRequest: nextCameraRequest('system', systemId),
    });
  },

  selectPlanet: (planetId) => {
    const snap = get().snapshot;
    if (!planetId) return;
    const planet = snap?.planetById.get(planetId) || null;
    if (snap && !planet) return;
    const systemId = planet ? planet.systemId : get().selectedSystemId;
    set({
      viewLevel: 'planet',
      selectedSystemId: systemId,
      selectedPlanetId: planetId,
      hoverId: null,
      cameraRequest: nextCameraRequest('planet', planetId),
    });
  },

  stepBack: () => {
    const { viewLevel, selectedSystemId } = get();
    if (viewLevel === 'planet' && selectedSystemId) {
      set({
        viewLevel: 'system',
        selectedPlanetId: null,
        hoverId: null,
        cameraRequest: nextCameraRequest('system', selectedSystemId),
      });
    } else {
      set({
        viewLevel: 'galaxy',
        selectedSystemId: null,
        selectedPlanetId: null,
        hoverId: null,
        cameraRequest: nextCameraRequest('galaxy', null),
      });
    }
  },

  setHoverId: (hoverId) => set({ hoverId: hoverId ?? null }),

  setSearchQuery: (searchQuery) => set({ searchQuery: String(searchQuery ?? '') }),

  setFilters: (filters) => set({ filters: filters || {} }),

  setHighlightIds: (ids) => set({ highlightIds: Array.isArray(ids) ? ids : [] }),

  setTimelineYear: (year) => set({ timelineYear: Number(year) || 2026 }),

  setTimelinePlaying: (playing) => set({ timelinePlaying: Boolean(playing) }),

  setCompareIds: (ids) => {
    const list = Array.isArray(ids) ? ids.slice(0, 3) : [];
    set({
      compareIds: list,
      compareOpen: list.length > 0,
    });
  },

  addCompareId: (id) => {
    if (!id || typeof id !== 'string') return;
    const current = get().compareIds;
    if (current.includes(id)) {
      set({ compareOpen: true });
      return;
    }
    const next = current.length >= 3 ? [...current.slice(1), id] : [...current, id];
    set({
      compareIds: next,
      compareOpen: true,
    });
  },

  removeCompareId: (id) => {
    if (!id) return;
    const next = get().compareIds.filter((x) => x !== id);
    set({
      compareIds: next,
      compareOpen: next.length > 0 ? get().compareOpen : false,
    });
  },

  clearCompareIds: () => set({ compareIds: [], compareOpen: false }),

  setCompareOpen: (open) => set({ compareOpen: Boolean(open) }),

  setScientistMode: (enabled) => set({ scientistMode: Boolean(enabled) }),

  setOrbitSpeed: (speed) =>
    set({ orbitSpeed: typeof speed === 'number' && Number.isFinite(speed) ? speed : 1.0 }),

  setHelmStatus: (status) =>
    set((state) => ({
      helm: {
        ...state.helm,
        status: String(status || 'unavailable'),
      },
    })),

  appendHelmMessage: (message) =>
    set((state) => ({
      helm: {
        ...state.helm,
        messages: [...state.helm.messages, message],
      },
    })),

  clearHelmMessages: () =>
    set((state) => ({
      helm: {
        ...state.helm,
        messages: [],
      },
    })),

  clearCameraRequest: () => set({ cameraRequest: null }),
}));

/**
 * Selects 3D-positioned host stars discovered on or before timelineYear.
 * Hosts without 3D position are excluded.
 * Unknown discovery years are never invented; they only appear when viewing all (year >= 2026).
 *
 * @param {object|null} snapshot
 * @param {number} [timelineYear=2026]
 * @returns {Array<object>} Filtered positioned host records
 */
export function selectVisibleGalaxyHosts(snapshot, timelineYear = 2026) {
  if (!snapshot?.galaxy) return [];
  const year = typeof timelineYear === 'number' && Number.isFinite(timelineYear) ? timelineYear : 2026;
  return snapshot.galaxy.filter((h) => {
    if (
      !h.hasPosition ||
      !h.posDisplay ||
      !Number.isFinite(h.posDisplay.x) ||
      !Number.isFinite(h.posDisplay.y) ||
      !Number.isFinite(h.posDisplay.z)
    ) {
      return false;
    }
    if (typeof h.firstDiscYear !== 'number' || !Number.isFinite(h.firstDiscYear)) {
      return year >= 2026;
    }
    return h.firstDiscYear <= year;
  });
}

/**
 * Selects confirmed planets discovered on or before timelineYear.
 *
 * @param {object|null} snapshot
 * @param {number} [timelineYear=2026]
 * @returns {Array<object>} Filtered planet records
 */
export function selectTimelineFilteredPlanets(snapshot, timelineYear = 2026) {
  if (!snapshot?.planets) return [];
  const year = typeof timelineYear === 'number' && Number.isFinite(timelineYear) ? timelineYear : 2026;
  return snapshot.planets.filter((p) => {
    const y = p.discovery?.year;
    if (typeof y !== 'number' || !Number.isFinite(y)) {
      return year >= 2026;
    }
    return y <= year;
  });
}

/**
 * Computes discovery timeline statistics through the given year.
 *
 * @param {object|null} snapshot
 * @param {number} [timelineYear=2026]
 * @returns {{ cumulativeCount: number, inExactYear: number, visibleHostsCount: number, methodCounts: Record<string, number> }}
 */
export function selectTimelineStats(snapshot, timelineYear = 2026) {
  const methodCounts = {
    Transit: 0,
    'Radial Velocity': 0,
    Microlensing: 0,
    Imaging: 0,
  };
  let cumulativeCount = 0;
  let inExactYear = 0;

  if (snapshot?.planets) {
    for (const p of snapshot.planets) {
      const y = p.discovery?.year;
      if (typeof y === 'number' && Number.isFinite(y) && y <= timelineYear) {
        cumulativeCount += 1;
        if (y === timelineYear) {
          inExactYear += 1;
        }
        const m = p.discovery?.method;
        if (m && Object.prototype.hasOwnProperty.call(methodCounts, m)) {
          methodCounts[m] += 1;
        }
      }
    }
  }

  const visibleHosts = selectVisibleGalaxyHosts(snapshot, timelineYear);

  return {
    cumulativeCount,
    inExactYear,
    visibleHostsCount: visibleHosts.length,
    methodCounts,
  };
}

