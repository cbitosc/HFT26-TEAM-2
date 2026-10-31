/**
 * server/helm/snapshotStore.js
 * Loads and decodes the active static snapshot from `public/snapshots/` into memory once.
 * Never calls external catalogs at runtime.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LatestSnapshotPointerSchema, ManifestSchema } from '../../shared/schemas.js';
import { decodeGalaxySnapshot, decodePlanetsSnapshot } from '../../shared/snapshotCodec.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_ROOT = path.resolve(__dirname, '../../public/snapshots');

let cachedSnapshot = null;

function readJsonSync(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Synchronously loads (or returns the cached) decoded server snapshot.
 * Identical structure to `useExplorerStore.getState().snapshot`.
 */
export function getServerSnapshot() {
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  let snapshotId = process.env.SNAPSHOT_ID ? String(process.env.SNAPSHOT_ID).trim() : '';
  if (!snapshotId) {
    const latestPath = path.join(SNAPSHOTS_ROOT, 'latest.json');
    const latestPointer = LatestSnapshotPointerSchema.parse(readJsonSync(latestPath));
    snapshotId = latestPointer.snapshotId;
  }

  const snapshotDir = path.join(SNAPSHOTS_ROOT, snapshotId);
  const rawManifest = readJsonSync(path.join(snapshotDir, 'manifest.json'));
  const rawGalaxy = readJsonSync(path.join(snapshotDir, 'galaxy.json'));
  const rawPlanets = readJsonSync(path.join(snapshotDir, 'planets.json'));

  const manifest = ManifestSchema.parse(rawManifest);
  const galaxy = decodeGalaxySnapshot(rawGalaxy);
  const planets = decodePlanetsSnapshot(rawPlanets);

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

  cachedSnapshot = Object.freeze({
    snapshotId,
    manifest,
    galaxy,
    planets,
    hostById,
    planetById,
    planetsBySystemId,
  });

  return cachedSnapshot;
}

export function resetServerSnapshotCache() {
  cachedSnapshot = null;
}
