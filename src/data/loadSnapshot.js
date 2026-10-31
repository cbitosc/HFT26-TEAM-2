/**
 * src/data/loadSnapshot.js
 * Fetches, validates, and decodes the static snapshot from `/snapshots/`
 * into the Zustand explorerStore. Never calls external catalogs at runtime.
 */

import { LatestSnapshotPointerSchema, ManifestSchema } from '../../shared/schemas.js';
import { decodeGalaxySnapshot, decodePlanetsSnapshot } from '../../shared/snapshotCodec.js';
import { decodeCompactSolutions } from '../../shared/domain/dispute.js';
import { useExplorerStore } from '../store/explorerStore.js';

let activeLoadPromise = null;
let cachedCrosscatalogFlags = null;
let cachedSolutionsData = null;
let activeSolutionsLoadPromise = null;

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.json();
}

/**
 * Loads safe derived cross-catalog flags for a snapshot, with fallback for legacy snapshots.
 * Never loads raw crosscatalog.json.
 *
 * @param {string} snapshotId
 * @returns {Promise<object|null>}
 */
export async function loadCrosscatalogFlags(snapshotId) {
  if (cachedCrosscatalogFlags && cachedCrosscatalogFlags.meta?.snapshotId === snapshotId) {
    return cachedCrosscatalogFlags;
  }
  if (!snapshotId) return null;
  try {
    const data = await fetchJson(`/snapshots/${snapshotId}/crosscatalog-flags.json`);
    cachedCrosscatalogFlags = data;
    return data;
  } catch {
    cachedCrosscatalogFlags = null;
    return null;
  }
}

/**
 * Returns currently cached cross-catalog flags payload (or null).
 */
export function getCachedCrosscatalogFlags() {
  return cachedCrosscatalogFlags;
}

/**
 * Returns safe derived flags for a specific planetId (or null).
 */
export function getCrosscatalogFlagsForPlanet(planetId) {
  if (!cachedCrosscatalogFlags || !cachedCrosscatalogFlags.planets || !planetId) {
    return null;
  }
  return cachedCrosscatalogFlags.planets[planetId] || null;
}

/**
 * Returns metadata from cross-catalog flags (source, bridge, timing, etc.)
 */
export function getCrosscatalogMeta() {
  return cachedCrosscatalogFlags?.meta || null;
}

/**
 * Loads published solutions (`solutions.json`) lazily for a snapshot.
 * Compatible with legacy snapshots (returns null on 404).
 *
 * @param {string} snapshotId
 * @returns {Promise<object|null>}
 */
export async function loadSolutions(snapshotId) {
  if (cachedSolutionsData && cachedSolutionsData.snapshotId === snapshotId) {
    return cachedSolutionsData;
  }
  if (!snapshotId) return null;
  if (activeSolutionsLoadPromise) {
    return activeSolutionsLoadPromise;
  }

  activeSolutionsLoadPromise = (async () => {
    try {
      const data = await fetchJson(`/snapshots/${snapshotId}/solutions.json`);
      cachedSolutionsData = data;
      return data;
    } catch {
      cachedSolutionsData = null;
      return null;
    } finally {
      activeSolutionsLoadPromise = null;
    }
  })();

  return activeSolutionsLoadPromise;
}

/**
 * Returns currently cached solutions data (or null).
 */
export function getCachedSolutionsData() {
  return cachedSolutionsData;
}

/**
 * Returns decoded published solutions for a specific planetId (or null).
 *
 * @param {string} planetId
 * @returns {Record<string, Array<object>>|null}
 */
export function getSolutionsForPlanet(planetId) {
  if (!cachedSolutionsData || !cachedSolutionsData.planets || !planetId) {
    return null;
  }
  const rawPlanet = cachedSolutionsData.planets[planetId];
  if (!rawPlanet) return null;
  return decodeCompactSolutions(rawPlanet, cachedSolutionsData.refs || []);
}

/**
 * Loads solutions.json for snapshotId if needed, then returns decoded solutions for planetId.
 *
 * @param {string} snapshotId
 * @param {string} planetId
 * @returns {Promise<Record<string, Array<object>>|null>}
 */
export async function loadPlanetSolutions(snapshotId, planetId) {
  const existing = getSolutionsForPlanet(planetId);
  if (existing) return existing;
  await loadSolutions(snapshotId);
  return getSolutionsForPlanet(planetId);
}

/**
 * Loads the active snapshot into `useExplorerStore`.
 * Idempotent if already loading or ready unless `force = true`.
 */
export async function loadSnapshot({ force = false } = {}) {
  const state = useExplorerStore.getState();
  if (!force && state.snapshotStatus === 'ready' && state.snapshot) {
    return state.snapshot;
  }
  if (!force && activeLoadPromise) {
    return activeLoadPromise;
  }

  state.setSnapshotLoading();

  activeLoadPromise = (async () => {
    try {
      const rawPointer = await fetchJson('/snapshots/latest.json');
      const pointer = LatestSnapshotPointerSchema.parse(rawPointer);
      const { snapshotId } = pointer;

      const basePath = `/snapshots/${snapshotId}`;
      const [rawManifest, rawGalaxy, rawPlanets] = await Promise.all([
        fetchJson(`${basePath}/manifest.json`),
        fetchJson(`${basePath}/galaxy.json`),
        fetchJson(`${basePath}/planets.json`),
      ]);

      const manifest = ManifestSchema.parse(rawManifest);
      const galaxy = decodeGalaxySnapshot(rawGalaxy);
      const planets = decodePlanetsSnapshot(rawPlanets);

      // Attempt loading safe derived cross-catalog flags (never breaks core snapshot)
      try {
        const rawFlags = await fetchJson(`${basePath}/crosscatalog-flags.json`);
        cachedCrosscatalogFlags = rawFlags;
      } catch {
        cachedCrosscatalogFlags = null;
      }

      useExplorerStore.getState().setSnapshotData({
        snapshotId,
        manifest,
        galaxy,
        planets,
      });

      return useExplorerStore.getState().snapshot;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useExplorerStore.getState().setSnapshotError(message);
      throw err;
    } finally {
      activeLoadPromise = null;
    }
  })();

  return activeLoadPromise;
}
