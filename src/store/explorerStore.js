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

  setCompareIds: (ids) => set({ compareIds: Array.isArray(ids) ? ids.slice(0, 3) : [] }),

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

