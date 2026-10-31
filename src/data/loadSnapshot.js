/**
 * src/data/loadSnapshot.js
 * Fetches, validates, and decodes the static snapshot from `/snapshots/`
 * into the Zustand explorerStore. Never calls external catalogs at runtime.
 */

import { LatestSnapshotPointerSchema, ManifestSchema } from '../../shared/schemas.js';
import { decodeGalaxySnapshot, decodePlanetsSnapshot } from '../../shared/snapshotCodec.js';
import { useExplorerStore } from '../store/explorerStore.js';

let activeLoadPromise = null;

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
