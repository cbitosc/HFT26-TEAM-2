/**
 * scripts/verify-snapshot.js
 * Phase 1a snapshot verifier (`npm run verify:snapshot`).
 *
 * Checks (ARCHITECTURE.md Section 6.9 & Section 14, DEC-001..DEC-009):
 *   1. Raw CSV remains outside `public/` and matches `manifest.sources[0].rawCsvSha256`.
 *   2. Input CSV rows === decoded output `planets.json` records (6,451 === 6,451).
 *   3. Every decoded planet has a unique `id` and valid schema (`PlanetRecordSchema`), and every
 *      decoded host in `galaxy.json` validates against `GalaxyHostSchema`.
 *   4. `contentHash` recomputed from all on-disk files needed to reconstruct the snapshot
 *      (`galaxy.json` and `planets.json`, including its embedded `refs` and `strings` dictionaries)
 *      matches `manifest.contentHash` and `latest.json.contentHash`, and is distinct from `rawCsvSha256`.
 *   5. No `NaN` or `Infinity` anywhere; no silent zero-filling where the raw CSV cell is empty;
 *      missing limit flags decode to `null`, never `0` (DEC-002); unavailable disputes decode to
 *      `disputed: null` and `contested: null`, never `false` ("uncontested").
 *   6. Every `Field` with `type: 'calculated'` or `'derived'` and non-null `v` has non-empty `inputs[]`;
 *      every `Field` with `type: 'archive_calculated'` has `inputs === null` and non-null `ref` (DEC-005).
 *   7. Strict decimal byte budgets:
 *      `galaxy.json` < 1,500,000 B; `planets.json` (including dictionaries) < 12,000,000 B uncompressed
 *      and < 3,000,000 B gzipped.
 *   8. Rebuilds canonical uncompacted objects in-memory directly from the raw CSV
 *      (`buildSnapshotFromCsv({ rawCsvPath, pscompparsConfigPath, writeFiles: false })`) and
 *      verifies 100% `assert.deepStrictEqual` equivalence across all 6,451 decoded planet records
 *      and all 4,847 decoded galaxy host records, plus direct `encode*Snapshot -> decode*Snapshot`
 *      round-trip equivalence against `canonicalMemory`. If any other snapshot directory exists in
 *      `public/snapshots/`, also verifies 100% `deepStrictEqual` equivalence against it and reports
 *      stale directories.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { buildSnapshotFromCsv } from './build-snapshot.js';
import {
  loadAndVerifyNasaCsv,
  parseNullableFloat,
  parseNullableLim,
} from './lib/csv.js';
import { computeSnapshotContentHash } from './lib/snapshotIO.js';
import {
  GalaxyHostSchema,
  LatestSnapshotPointerSchema,
  ManifestSchema,
  PlanetRecordSchema,
} from '../shared/schemas.js';
import {
  COMPACT_SNAPSHOT_FORMAT,
  decodeGalaxySnapshot,
  decodePlanetsSnapshot,
  encodeGalaxySnapshot,
  encodePlanetsSnapshot,
} from '../shared/snapshotCodec.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const SIZE_BUDGETS = Object.freeze({
  galaxyJsonMaxBytes: 1_500_000,
  planetsJsonMaxBytes: 12_000_000,
  planetsGzipMaxBytes: 3_000_000,
});

export function verifySnapshotOnDisk({
  snapshotsDir = path.join(ROOT, 'public', 'snapshots'),
  rawCsvPath = path.join(ROOT, 'data', 'raw', 'pscomppars.csv'),
  pscompparsConfigPath = path.join(ROOT, 'data', 'config', 'columns.pscomppars.json'),
} = {}) {
  // 1. Ensure no raw CSV is inside public/
  const publicDataDir = path.join(ROOT, 'public', 'data');
  if (fs.existsSync(publicDataDir)) {
    const files = fs.readdirSync(publicDataDir);
    const csvFiles = files.filter((f) => f.toLowerCase().endsWith('.csv'));
    if (csvFiles.length > 0) {
      throw new Error(`Forbidden raw CSV found inside public/data/: ${csvFiles.join(', ')}`);
    }
  }

  // 2. Load and validate latest.json
  const latestPath = path.join(snapshotsDir, 'latest.json');
  if (!fs.existsSync(latestPath)) {
    throw new Error(`Missing latest snapshot pointer at ${latestPath}`);
  }
  const latestRaw = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  const latest = LatestSnapshotPointerSchema.parse(latestRaw);

  const snapDir = path.join(snapshotsDir, latest.snapshotId);
  const manifestPath = path.join(snapDir, 'manifest.json');
  const galaxyPath = path.join(snapDir, 'galaxy.json');
  const planetsPath = path.join(snapDir, 'planets.json');

  for (const p of [manifestPath, galaxyPath, planetsPath]) {
    if (!fs.existsSync(p)) {
      throw new Error(`Missing snapshot file: ${p}`);
    }
  }

  // 3. Validate manifest.json
  const manifestRaw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const manifest = ManifestSchema.parse(manifestRaw);

  if (manifest.snapshotId !== latest.snapshotId) {
    throw new Error(
      `Mismatch between latest.snapshotId (${latest.snapshotId}) and manifest.snapshotId (${manifest.snapshotId})`
    );
  }
  if (manifest.contentHash !== latest.contentHash) {
    throw new Error(`Mismatch between latest.contentHash and manifest.contentHash`);
  }

  // 4. Verify contentHash separately from rawCsvSha256
  const galaxyJsonText = fs.readFileSync(galaxyPath, 'utf8').trimEnd();
  const planetsJsonText = fs.readFileSync(planetsPath, 'utf8').trimEnd();
  const recomputedContentHash = computeSnapshotContentHash({
    galaxyJson: galaxyJsonText,
    planetsJson: planetsJsonText,
  });

  if (recomputedContentHash !== manifest.contentHash) {
    throw new Error(
      `Snapshot contentHash mismatch: expected ${manifest.contentHash}, recomputed ${recomputedContentHash}`
    );
  }
  if (!manifest.snapshotId.endsWith(recomputedContentHash.slice(0, 8))) {
    throw new Error(
      `snapshotId (${manifest.snapshotId}) does not end with 8-hex prefix of contentHash (${recomputedContentHash.slice(0, 8)})`
    );
  }

  // 5. Load raw CSV and verify checksum & row count
  const pscompparsConfig = JSON.parse(fs.readFileSync(pscompparsConfigPath, 'utf8'));
  const csvData = loadAndVerifyNasaCsv(rawCsvPath, pscompparsConfig.columns);

  const sourceEntry = manifest.sources.find((s) => s.name === 'pscomppars');
  if (!sourceEntry) {
    throw new Error('manifest.sources is missing pscomppars entry');
  }
  if (sourceEntry.rawCsvSha256 !== csvData.rawSha256) {
    throw new Error(
      `rawCsvSha256 mismatch: manifest=${sourceEntry.rawCsvSha256}, actual=${csvData.rawSha256}`
    );
  }
  if (manifest.contentHash === sourceEntry.rawCsvSha256) {
    throw new Error('contentHash must be distinct from rawCsvSha256');
  }

  // 6. Check strict file size budgets (< 1,500,000 B galaxy, < 12,000,000 B planets, < 3,000,000 B planets.gz)
  const galaxyBytes = fs.statSync(galaxyPath).size;
  const galaxyGzipBytes = zlib.gzipSync(fs.readFileSync(galaxyPath)).length;
  const planetsBytes = fs.statSync(planetsPath).size;
  const planetsGzipBytes = zlib.gzipSync(fs.readFileSync(planetsPath)).length;
  const manifestBytes = fs.statSync(manifestPath).size;
  const latestBytes = fs.statSync(latestPath).size;

  if (galaxyBytes >= SIZE_BUDGETS.galaxyJsonMaxBytes) {
    throw new Error(
      `galaxy.json (${galaxyBytes} B) exceeds strict budget (< ${SIZE_BUDGETS.galaxyJsonMaxBytes} B)`
    );
  }
  if (planetsBytes >= SIZE_BUDGETS.planetsJsonMaxBytes) {
    throw new Error(
      `planets.json (${planetsBytes} B) exceeds strict budget (< ${SIZE_BUDGETS.planetsJsonMaxBytes} B)`
    );
  }
  if (planetsGzipBytes >= SIZE_BUDGETS.planetsGzipMaxBytes) {
    throw new Error(
      `planets.json gzip (${planetsGzipBytes} B) exceeds strict budget (< ${SIZE_BUDGETS.planetsGzipMaxBytes} B)`
    );
  }

  // 7. Decode compact on-disk JSON into canonical GalaxyHost[] and PlanetRecord[]
  const rawGalaxyPayload = JSON.parse(galaxyJsonText);
  const rawPlanetsPayload = JSON.parse(planetsJsonText);

  const galaxy = decodeGalaxySnapshot(rawGalaxyPayload);
  const planets = decodePlanetsSnapshot(rawPlanetsPayload);

  if (planets.length !== csvData.rows.length) {
    throw new Error(
      `Row count mismatch: raw CSV has ${csvData.rows.length} rows, decoded planets.json has ${planets.length} records`
    );
  }

  // 8. Validate every decoded GalaxyHost and PlanetRecord with Zod, plus row-by-row zero-fill / limit / dispute checks
  const seenHostIds = new Set();
  for (let i = 0; i < galaxy.length; i++) {
    const host = GalaxyHostSchema.parse(galaxy[i]);
    if (seenHostIds.has(host.systemId)) {
      throw new Error(`Duplicate systemId in galaxy.json: ${host.systemId}`);
    }
    seenHostIds.add(host.systemId);
  }

  const seenPlanetIds = new Set();
  const seenPlanetNames = new Set();
  const duplicateNames = [];
  const fieldTypeCounts = {
    archive: 0,
    archive_calculated: 0,
    calculated: 0,
    derived: 0,
    reference: 0,
  };
  const missingCounts = {};
  const directArchiveCols = [
    ['pl_rade', 'pl_rade', 'pl_radelim'],
    ['pl_bmasse', 'pl_bmasse', 'pl_bmasselim'],
    ['pl_orbper', 'pl_orbper', 'pl_orbperlim'],
    ['pl_orbeccen', 'pl_orbeccen', 'pl_orbeccenlim'],
    ['pl_eqt', 'pl_eqt', 'pl_eqtlim'],
    ['st_teff', 'st_teff', 'st_tefflim'],
    ['st_rad', 'st_rad', 'st_radlim'],
    ['st_mass', 'st_mass', 'st_masslim'],
    ['st_lum', 'st_lum', 'st_lumlim'],
    ['sy_dist', 'sy_dist', null],
  ];

  for (const [fieldKey] of directArchiveCols) {
    missingCounts[fieldKey] = 0;
  }
  missingCounts.pl_orbsmax = 0;
  missingCounts.pl_insol = 0;
  missingCounts.pl_dens = 0;
  missingCounts.st_lum_linear = 0;

  for (let i = 0; i < planets.length; i++) {
    const p = PlanetRecordSchema.parse(planets[i]);
    const rawRow = csvData.rows[i];

    if (seenPlanetIds.has(p.id)) {
      throw new Error(`Duplicate planetId in planets.json: ${p.id}`);
    }
    seenPlanetIds.add(p.id);

    if (seenPlanetNames.has(p.name)) {
      duplicateNames.push(p.name);
    }
    seenPlanetNames.add(p.name);

    // Ensure unavailable disputes never decode as uncontested (false)
    if (p.dispute.available === false) {
      if (p.dispute.disputed !== null) {
        throw new Error(
          `Dispute honesty violation on ${p.name}: unavailable dispute has disputed=${p.dispute.disputed} instead of null`
        );
      }
      for (const [dfKey, dfVal] of Object.entries(p.dispute.fields)) {
        if (dfVal.contested !== null) {
          throw new Error(
            `Dispute honesty violation on ${p.name} (${dfKey}): unavailable dispute has contested=${dfVal.contested} instead of null`
          );
        }
      }
    }

    // Verify no blank in raw CSV was turned into 0 for direct archive fields or limit flags
    for (const [fieldKey, valCol, limCol] of directArchiveCols) {
      const rawVal = parseNullableFloat(rawRow[valCol]);
      const rawLim = limCol ? parseNullableLim(rawRow[limCol]) : null;
      const fieldObj = p.fields[fieldKey];

      if (rawVal === null && fieldObj.v !== null) {
        throw new Error(
          `Data honesty violation on ${p.name} (${fieldKey}): raw CSV cell is empty but snapshot has v=${fieldObj.v}`
        );
      }
      if (rawVal !== null && fieldObj.v !== rawVal) {
        throw new Error(
          `Archive value mismatch on ${p.name} (${fieldKey}): raw=${rawVal}, snapshot=${fieldObj.v}`
        );
      }
      if (rawLim === null && fieldObj.lim !== null) {
        throw new Error(
          `Limit flag violation on ${p.name} (${fieldKey}): raw limit is empty/absent but snapshot has lim=${fieldObj.lim}`
        );
      }
      if (fieldObj.v === null) {
        missingCounts[fieldKey] += 1;
      }
    }

    if (p.fields.pl_orbsmax.v === null) missingCounts.pl_orbsmax += 1;
    if (p.fields.pl_insol.v === null) missingCounts.pl_insol += 1;
    if (p.fields.pl_dens.v === null) missingCounts.pl_dens += 1;
    if (p.fields.st_lum_linear.v === null) missingCounts.st_lum_linear += 1;

    for (const f of Object.values(p.fields)) {
      if (f.v !== null) {
        fieldTypeCounts[f.type] = (fieldTypeCounts[f.type] || 0) + 1;
      }
    }
  }

  // 9. Rebuild canonical uncompacted objects in-memory directly from the raw CSV and verify 100%
  //    deepStrictEqual equivalence across all 6,451 planets and 4,847 hosts, plus codec round-trip
  //    equivalence (independent of any earlier draft directory on disk).
  const canonicalMemory = buildSnapshotFromCsv({
    rawCsvPath,
    pscompparsConfigPath,
    writeFiles: false,
  });

  assert.equal(planets.length, canonicalMemory.planets.length);
  assert.equal(galaxy.length, canonicalMemory.galaxy.length);
  for (let i = 0; i < planets.length; i++) {
    assert.deepStrictEqual(
      planets[i],
      canonicalMemory.planets[i],
      `Decoded on-disk planet mismatch against canonicalMemory at index ${i} (${planets[i].name})`
    );
  }
  for (let i = 0; i < galaxy.length; i++) {
    assert.deepStrictEqual(
      galaxy[i],
      canonicalMemory.galaxy[i],
      `Decoded on-disk galaxy host mismatch against canonicalMemory at index ${i} (${galaxy[i].hostname})`
    );
  }

  const roundTripPlanets = decodePlanetsSnapshot(
    JSON.parse(JSON.stringify(encodePlanetsSnapshot(canonicalMemory.planets)))
  );
  const roundTripGalaxy = decodeGalaxySnapshot(
    JSON.parse(JSON.stringify(encodeGalaxySnapshot(canonicalMemory.galaxy)))
  );
  assert.equal(roundTripPlanets.length, canonicalMemory.planets.length);
  assert.equal(roundTripGalaxy.length, canonicalMemory.galaxy.length);
  for (let i = 0; i < roundTripPlanets.length; i++) {
    assert.deepStrictEqual(
      roundTripPlanets[i],
      canonicalMemory.planets[i],
      `Codec round-trip planet mismatch against canonicalMemory at index ${i} (${canonicalMemory.planets[i].name})`
    );
  }
  for (let i = 0; i < roundTripGalaxy.length; i++) {
    assert.deepStrictEqual(
      roundTripGalaxy[i],
      canonicalMemory.galaxy[i],
      `Codec round-trip galaxy host mismatch against canonicalMemory at index ${i} (${canonicalMemory.galaxy[i].hostname})`
    );
  }

  const canonicalMemoryComparison = {
    planetsCompared: planets.length,
    hostsCompared: galaxy.length,
    onDiskDeepStrictEqual: true,
    codecRoundTripDeepStrictEqual: true,
  };

  // 10. Detect any other snapshot directories in public/snapshots/ and compare against earlier draft if present
  const staleSnapshotsInPublic = [];
  const draftComparisons = [];

  for (const entry of fs.readdirSync(snapshotsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== latest.snapshotId) {
      const otherDir = path.join(snapshotsDir, entry.name);
      const otherPlanetsPath = path.join(otherDir, 'planets.json');
      const otherGalaxyPath = path.join(otherDir, 'galaxy.json');
      let dirBytes = 0;
      for (const f of fs.readdirSync(otherDir)) {
        dirBytes += fs.statSync(path.join(otherDir, f)).size;
      }
      staleSnapshotsInPublic.push({
        snapshotId: entry.name,
        totalBytes: dirBytes,
      });

      if (fs.existsSync(otherPlanetsPath) && fs.existsSync(otherGalaxyPath)) {
        const draftPlanets = decodePlanetsSnapshot(
          JSON.parse(fs.readFileSync(otherPlanetsPath, 'utf8'))
        );
        const draftGalaxy = decodeGalaxySnapshot(
          JSON.parse(fs.readFileSync(otherGalaxyPath, 'utf8'))
        );
        assert.equal(planets.length, draftPlanets.length);
        assert.equal(galaxy.length, draftGalaxy.length);
        for (let i = 0; i < planets.length; i++) {
          assert.deepStrictEqual(
            planets[i],
            draftPlanets[i],
            `Decoded planet mismatch against draft ${entry.name} at index ${i} (${planets[i].name})`
          );
        }
        for (let i = 0; i < galaxy.length; i++) {
          assert.deepStrictEqual(
            galaxy[i],
            draftGalaxy[i],
            `Decoded galaxy host mismatch against draft ${entry.name} at index ${i} (${galaxy[i].hostname})`
          );
        }
        draftComparisons.push({
          comparedAgainst: entry.name,
          planetsCompared: planets.length,
          hostsCompared: galaxy.length,
          deepStrictEqual: true,
        });
      }
    }
  }

  return {
    ok: true,
    snapshotId: manifest.snapshotId,
    format: rawPlanetsPayload?.format ?? 'canonical-array',
    dictionaryCounts:
      rawPlanetsPayload?.format === COMPACT_SNAPSHOT_FORMAT
        ? {
            uniqueRefs: rawPlanetsPayload.refs.length,
            uniqueStrings: rawPlanetsPayload.strings.length,
          }
        : null,
    contentHash: manifest.contentHash,
    rawCsvSha256: sourceEntry.rawCsvSha256,
    counts: manifest.counts,
    duplicateNamesCount: duplicateNames.length,
    fileSizes: {
      galaxyBytes,
      galaxyGzipBytes,
      planetsBytes,
      planetsGzipBytes,
      manifestBytes,
      latestBytes,
    },
    canonicalMemoryComparison,
    draftComparisons,
    staleSnapshotsInPublic,
    fieldTypeCounts,
    missingCounts,
  };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const report = verifySnapshotOnDisk();
  console.log('Snapshot verification PASSED:');
  console.log(JSON.stringify(report, null, 2));
}
