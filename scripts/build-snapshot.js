/**
 * scripts/build-snapshot.js
 * Phase 1a deterministic snapshot builder from the NASA Exoplanet Archive `pscomppars` CSV.
 *
 * Honours AGENTS.md, docs/ARCHITECTURE.md Section 5 & 6, and human-approved decisions DEC-001..DEC-009:
 *   - Reads `data/raw/pscomppars.csv` without modifying it; keeps raw CSV outside `public/`.
 *   - Enforces the 83-column pinned whitelist in `data/config/columns.pscomppars.json`.
 *   - Preserves all 6,451 source rows; never invents or zero-fills missing values (`null`) or limit flags (`null`).
 *   - Distinguishes published archive values (`archive`), NASA composite calculated values (`archive_calculated`,
 *     with `inputs: null` and preserved raw reference), our published-formula calculations (`calculated`),
 *     and explorer heuristics (`derived`).
 *   - Computes separate `contentHash` (over compiled snapshot JSON) and `rawCsvSha256` (over raw CSV bytes).
 *   - Writes `public/snapshots/<snapshotId>/{manifest.json, galaxy.json, planets.json}` and `public/snapshots/latest.json`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import {
  extractDatePrefixFromHeader,
  loadAndVerifyNasaCsv,
  parseNullableFloat,
  parseNullableInt,
  parseNullableLim,
  parseNullableString,
} from './lib/csv.js';
import { createSlugAllocator } from './lib/names.js';
import { parseArchiveRef } from './lib/refs.js';
import {
  computeColumnWhitelistHash,
  computeSnapshotContentHash,
  writeJsonFile,
} from './lib/snapshotIO.js';

import { makeField } from '../shared/receipts.js';
import {
  encodeGalaxySnapshot,
  encodePlanetsSnapshot,
} from '../shared/snapshotCodec.js';
import { classifyPlanet } from '../shared/domain/classify.js';
import { calcCompleteness } from '../shared/domain/completeness.js';
import { buildDisputeSummary } from '../shared/domain/dispute.js';
import { calcGalaxyPosition } from '../shared/domain/galaxyPosition.js';
import { evaluateHabLab } from '../shared/domain/habLab.js';
import { buildHzEdgeFields } from '../shared/domain/hz.js';
import { resolveBulkDensityField, resolveSemiMajorAxisField } from '../shared/domain/kepler.js';
import {
  resolveInsolationField,
  resolveStellarLuminosityLinear,
} from '../shared/domain/luminosity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ARCHIVE_FIELD_SPECS = Object.freeze([
  {
    key: 'pl_rade',
    valCol: 'pl_rade',
    e1Col: 'pl_radeerr1',
    e2Col: 'pl_radeerr2',
    limCol: 'pl_radelim',
    refCol: 'pl_rade_reflink',
  },
  {
    key: 'pl_bmasse',
    valCol: 'pl_bmasse',
    e1Col: 'pl_bmasseerr1',
    e2Col: 'pl_bmasseerr2',
    limCol: 'pl_bmasselim',
    refCol: 'pl_bmasse_reflink',
  },
  {
    key: 'pl_dens',
    valCol: 'pl_dens',
    e1Col: 'pl_denserr1',
    e2Col: 'pl_denserr2',
    limCol: 'pl_denslim',
    refCol: 'pl_dens_reflink',
  },
  {
    key: 'pl_orbper',
    valCol: 'pl_orbper',
    e1Col: 'pl_orbpererr1',
    e2Col: 'pl_orbpererr2',
    limCol: 'pl_orbperlim',
    refCol: 'pl_orbper_reflink',
  },
  {
    key: 'pl_orbsmax',
    valCol: 'pl_orbsmax',
    e1Col: 'pl_orbsmaxerr1',
    e2Col: 'pl_orbsmaxerr2',
    limCol: 'pl_orbsmaxlim',
    refCol: 'pl_orbsmax_reflink',
  },
  {
    key: 'pl_orbeccen',
    valCol: 'pl_orbeccen',
    e1Col: 'pl_orbeccenerr1',
    e2Col: 'pl_orbeccenerr2',
    limCol: 'pl_orbeccenlim',
    refCol: 'pl_orbeccen_reflink',
  },
  {
    key: 'pl_eqt',
    valCol: 'pl_eqt',
    e1Col: 'pl_eqterr1',
    e2Col: 'pl_eqterr2',
    limCol: 'pl_eqtlim',
    refCol: 'pl_eqt_reflink',
  },
  {
    key: 'pl_insol',
    valCol: 'pl_insol',
    e1Col: 'pl_insolerr1',
    e2Col: 'pl_insolerr2',
    limCol: 'pl_insollim',
    refCol: 'pl_insol_reflink',
  },
  {
    key: 'st_teff',
    valCol: 'st_teff',
    e1Col: 'st_tefferr1',
    e2Col: 'st_tefferr2',
    limCol: 'st_tefflim',
    refCol: 'st_teff_reflink',
  },
  {
    key: 'st_rad',
    valCol: 'st_rad',
    e1Col: 'st_raderr1',
    e2Col: 'st_raderr2',
    limCol: 'st_radlim',
    refCol: 'st_rad_reflink',
  },
  {
    key: 'st_mass',
    valCol: 'st_mass',
    e1Col: 'st_masserr1',
    e2Col: 'st_masserr2',
    limCol: 'st_masslim',
    refCol: 'st_mass_reflink',
  },
  {
    key: 'st_lum',
    valCol: 'st_lum',
    e1Col: 'st_lumerr1',
    e2Col: 'st_lumerr2',
    limCol: 'st_lumlim',
    refCol: 'st_lum_reflink',
  },
  {
    key: 'sy_dist',
    valCol: 'sy_dist',
    e1Col: 'sy_disterr1',
    e2Col: 'sy_disterr2',
    limCol: null, // DEC-002: sy_distlim does not exist in pscomppars or ps; lim is always null
    refCol: 'sy_dist_reflink',
  },
]);

function mapMassProvenanceLabel(massProv) {
  switch (massProv) {
    case 'Mass':
      return 'measured';
    case 'M-R relationship':
      return 'model-estimated';
    case 'Msini':
      return 'minimum-mass lower bound';
    case 'Msin(i)/sin(i)':
      return 'inclination-corrected estimate';
    default:
      return 'unknown';
  }
}

function parseFlagToNullableBoolean(cell) {
  const n = parseNullableInt(cell);
  if (n === 1) return true;
  if (n === 0) return false;
  return null;
}

/**
 * Builds an archive Field from a raw CSV row, distinguishing published values (`archive`)
 * from NASA composite calculated values (`archive_calculated`) per DEC-005 Option A.
 */
function buildArchiveFieldFromRow(row, spec, massProvenance) {
  const v = parseNullableFloat(row[spec.valCol]);
  const e1 = spec.e1Col ? parseNullableFloat(row[spec.e1Col]) : null;
  const e2 = spec.e2Col ? parseNullableFloat(row[spec.e2Col]) : null;
  const lim = spec.limCol ? parseNullableLim(row[spec.limCol]) : null;
  const { ref, isArchiveCalculated } = spec.refCol
    ? parseArchiveRef(row[spec.refCol])
    : { ref: null, isArchiveCalculated: false };

  const isMrModelMass = spec.key === 'pl_bmasse' && massProvenance === 'M-R relationship';

  if (v !== null && (isArchiveCalculated || isMrModelMass)) {
    return makeField({
      v,
      e1,
      e2,
      lim,
      type: 'archive_calculated',
      ref,
      formula: isMrModelMass ? 'nasa_mr_relationship' : 'nasa_pscp_calc',
      inputs: null, // DEC-005 Option A: unknown NASA inputs remain null
    });
  }

  return makeField({
    v,
    e1,
    e2,
    lim,
    type: 'archive',
    ref,
    formula: null,
    inputs: null,
  });
}

export function buildSnapshotFromCsv({
  rawCsvPath = path.join(ROOT, 'data', 'raw', 'pscomppars.csv'),
  pscompparsConfigPath = path.join(ROOT, 'data', 'config', 'columns.pscomppars.json'),
  psConfigPath = path.join(ROOT, 'data', 'config', 'columns.ps.json'),
  outputRootDir = path.join(ROOT, 'public', 'snapshots'),
  writeFiles = true,
} = {}) {
  const pscompparsConfig = JSON.parse(fs.readFileSync(pscompparsConfigPath, 'utf8'));
  const psConfig = JSON.parse(fs.readFileSync(psConfigPath, 'utf8'));

  const whitelistColumns = pscompparsConfig.columns;
  if (!Array.isArray(whitelistColumns) || whitelistColumns.length !== 83) {
    throw new Error(
      `Expected 83 whitelisted columns in ${pscompparsConfigPath}, got ${whitelistColumns?.length}`
    );
  }

  const csvData = loadAndVerifyNasaCsv(rawCsvPath, whitelistColumns);
  const columnWhitelistHash = computeColumnWhitelistHash(whitelistColumns, psConfig.columns || []);

  const planetSlugger = createSlugAllocator({ reuseForSameRawName: false });
  const systemSlugger = createSlugAllocator({ reuseForSameRawName: true });

  const planets = [];
  const hostGroups = new Map();
  let planetsWithPosition = 0;

  for (const row of csvData.rows) {
    const plName = parseNullableString(row.pl_name);
    const hostname = parseNullableString(row.hostname);
    if (!plName || !hostname) {
      throw new Error(`Row missing required pl_name or hostname: ${JSON.stringify(row)}`);
    }

    const planetId = planetSlugger.allocate(plName);
    const systemId = systemSlugger.allocate(hostname);

    const rawMassProv = parseNullableString(row.pl_bmassprov);
    const massProvenance =
      rawMassProv === 'Mass' ||
      rawMassProv === 'M-R relationship' ||
      rawMassProv === 'Msini' ||
      rawMassProv === 'Msin(i)/sin(i)'
        ? rawMassProv
        : null;
    const massProvenanceLabel = mapMassProvenanceLabel(massProvenance);

    const archiveFields = {};
    for (const spec of ARCHIVE_FIELD_SPECS) {
      archiveFields[spec.key] = buildArchiveFieldFromRow(row, spec, massProvenance);
    }

    // Derived / fallback fields (only when archive value is missing, preserving provenance)
    const resolvedOrbsmax = resolveSemiMajorAxisField(
      planetId,
      archiveFields.pl_orbsmax,
      archiveFields.st_mass,
      archiveFields.pl_orbper
    );
    const lumResult = resolveStellarLuminosityLinear(
      planetId,
      archiveFields.st_lum,
      archiveFields.st_rad,
      archiveFields.st_teff
    );
    const resolvedInsol = resolveInsolationField(
      planetId,
      archiveFields.pl_insol,
      lumResult.field,
      resolvedOrbsmax
    );
    const resolvedDens = resolveBulkDensityField(
      planetId,
      archiveFields.pl_dens,
      archiveFields.pl_bmasse,
      archiveFields.pl_rade,
      massProvenance
    );
    const hzBuilt = buildHzEdgeFields(planetId, archiveFields.st_teff, lumResult.field);

    const fields = {
      pl_rade: archiveFields.pl_rade,
      pl_bmasse: archiveFields.pl_bmasse,
      pl_dens: resolvedDens,
      pl_orbper: archiveFields.pl_orbper,
      pl_orbsmax: resolvedOrbsmax,
      pl_orbeccen: archiveFields.pl_orbeccen,
      pl_eqt: archiveFields.pl_eqt,
      pl_insol: resolvedInsol,
      st_teff: archiveFields.st_teff,
      st_rad: archiveFields.st_rad,
      st_mass: archiveFields.st_mass,
      st_lum: archiveFields.st_lum,
      st_lum_linear: lumResult.field,
      sy_dist: archiveFields.sy_dist,
      hz_recent_venus: hzBuilt.hz_recent_venus,
      hz_runaway_greenhouse: hzBuilt.hz_runaway_greenhouse,
      hz_moist_greenhouse: hzBuilt.hz_moist_greenhouse,
      hz_max_greenhouse: hzBuilt.hz_max_greenhouse,
      hz_early_mars: hzBuilt.hz_early_mars,
      completeness: null,
    };

    const completenessResult = calcCompleteness(planetId, fields);
    fields.completeness = completenessResult.field;

    const spectralType = parseNullableString(row.st_spectype);
    const { ref: spectralTypeRef } = parseArchiveRef(row.st_spectype_reflink);
    const { ref: discRef } = parseArchiveRef(row.disc_refname);
    const { ref: coordRef } = parseArchiveRef(row.ra_reflink);

    const raDeg = parseNullableFloat(row.ra);
    const decDeg = parseNullableFloat(row.dec);
    const syDistPc = fields.sy_dist.v;

    if (
      raDeg !== null &&
      decDeg !== null &&
      syDistPc !== null &&
      syDistPc > 0
    ) {
      planetsWithPosition += 1;
    }

    const planetClass = classifyPlanet(
      fields.pl_rade.v,
      fields.pl_eqt.v,
      fields.pl_rade.lim,
      fields.pl_eqt.lim
    );

    const hab = evaluateHabLab({
      planetId,
      fields,
      hzEdges: hzBuilt.edges,
      lumRoute: lumResult.route,
      massProvenance,
      spectralTypeRaw: spectralType,
      completenessResult,
    });

    const dispute = buildDisputeSummary(null);

    const planetRecord = {
      id: planetId,
      name: plName,
      systemId,
      hostname,
      plLetter: parseNullableString(row.pl_letter),
      gaiaDr3Id: parseNullableString(row.gaia_dr3_id),
      status: 'confirmed',
      discovery: {
        method: parseNullableString(row.discoverymethod),
        year: parseNullableInt(row.disc_year),
        facility: parseNullableString(row.disc_facility),
        pubdate: parseNullableString(row.disc_pubdate),
        ref: discRef,
      },
      system: {
        starCount: parseNullableInt(row.sy_snum),
        planetCount: parseNullableInt(row.sy_pnum),
        circumbinary: parseFlagToNullableBoolean(row.cb_flag),
        controversialFlag: parseFlagToNullableBoolean(row.pl_controv_flag),
        spectralType,
        spectralTypeRef,
        raDeg,
        decDeg,
        coordRef,
      },
      massProvenance,
      massProvenanceLabel,
      planetClass,
      completeness: completenessResult.score,
      fields,
      hab,
      dispute,
    };

    planets.push(planetRecord);

    if (!hostGroups.has(systemId)) {
      hostGroups.set(systemId, {
        systemId,
        hostname,
        planets: [],
      });
    }
    hostGroups.get(systemId).planets.push(planetRecord);
  }

  // Build GalaxyHost records
  const galaxy = [];
  let hostsWithPosition = 0;

  for (const group of hostGroups.values()) {
    const hostPlanets = group.planets;
    const planetIds = hostPlanets.map((p) => p.id);

    let firstDiscYear = null;
    let primaryMethod = null;
    let syPnum = null;
    let spectralType = null;
    let stTeff = null;
    let syDistPc = null;
    let raDeg = null;
    let decDeg = null;
    let hasDisputedPlanet = false;
    let hasHzPlanet = false;

    for (const p of hostPlanets) {
      if (p.discovery.year !== null && (firstDiscYear === null || p.discovery.year < firstDiscYear)) {
        firstDiscYear = p.discovery.year;
        if (p.discovery.method) {
          primaryMethod = p.discovery.method;
        }
      }
      if (!primaryMethod && p.discovery.method) {
        primaryMethod = p.discovery.method;
      }
      if (syPnum === null && p.system.planetCount !== null) {
        syPnum = p.system.planetCount;
      }
      if (spectralType === null && p.system.spectralType !== null) {
        spectralType = p.system.spectralType;
      }
      if (stTeff === null && p.fields.st_teff.v !== null) {
        stTeff = p.fields.st_teff.v;
      }
      if (syDistPc === null && p.fields.sy_dist.v !== null && p.fields.sy_dist.v > 0) {
        syDistPc = p.fields.sy_dist.v;
      }
      if (raDeg === null && p.system.raDeg !== null) {
        raDeg = p.system.raDeg;
      }
      if (decDeg === null && p.system.decDeg !== null) {
        decDeg = p.system.decDeg;
      }
      if (p.dispute.disputed === true) {
        hasDisputedPlanet = true;
      }
      if (
        p.hab.hzPosition.status === 'in_conservative' ||
        p.hab.hzPosition.status === 'in_optimistic_only'
      ) {
        hasHzPlanet = true;
      }
    }

    const { posPc, posDisplay } = calcGalaxyPosition(raDeg, decDeg, syDistPc);
    const hasPosition = posPc !== null && posDisplay !== null;
    if (hasPosition) {
      hostsWithPosition += 1;
    }

    galaxy.push({
      systemId: group.systemId,
      hostname: group.hostname,
      planetCount: hostPlanets.length,
      planetIds,
      firstDiscYear,
      primaryMethod,
      syDistPc: syDistPc !== null ? Number(syDistPc.toFixed(2)) : null,
      hasPosition,
      posPc,
      posDisplay,
      hasDisputedPlanet,
      hasHzPlanet,
    });
  }

  const encodedGalaxy = encodeGalaxySnapshot(galaxy);
  const encodedPlanets = encodePlanetsSnapshot(planets);

  const galaxyJson = JSON.stringify(encodedGalaxy);
  const planetsJson = JSON.stringify(encodedPlanets);
  const contentHash = computeSnapshotContentHash({ galaxyJson, planetsJson });

  const datePrefix = extractDatePrefixFromHeader(csvData.headerTimestampRaw) || '2026-10-30';
  const snapshotId = `${datePrefix}-${contentHash.slice(0, 8)}`;

  const galaxyBytes = Buffer.byteLength(`${galaxyJson}\n`, 'utf8');
  const planetsBytes = Buffer.byteLength(`${planetsJson}\n`, 'utf8');
  const planetsGzipBytes = zlib.gzipSync(Buffer.from(`${planetsJson}\n`, 'utf8')).length;
  const galaxyGzipBytes = zlib.gzipSync(Buffer.from(`${galaxyJson}\n`, 'utf8')).length;

  const relRawCsvPath = path.relative(ROOT, rawCsvPath).replace(/\\/g, '/');

  const manifestDraft = {
    snapshotId,
    fetchedAt: null, // DEC-002: unknown download time remains null
    latestRowUpdate: null, // DEC-002: pscomppars has no rowupdate; remains null
    headerTimestampRaw: csvData.headerTimestampRaw,
    sources: [
      {
        name: 'pscomppars',
        doi: '10.26133/NEA13',
        urlOrPath: relRawCsvPath,
        rawCsvPath: relRawCsvPath,
        rawCsvSha256: csvData.rawSha256,
        rawCsvBytes: csvData.rawBytes,
        rowCount: csvData.rows.length,
      },
    ],
    contentHash,
    columnWhitelistHash,
    counts: {
      planets: planets.length,
      hosts: galaxy.length,
      hostsWithPosition,
      planetsWithPosition,
      withSolutions: 0,
    },
    fileSizes: {
      'galaxy.json': galaxyBytes,
      'galaxy.json.gz': galaxyGzipBytes,
      'planets.json': planetsBytes,
      'planets.json.gz': planetsGzipBytes,
    },
  };

  const manifestJson = JSON.stringify(manifestDraft, null, 2);
  const manifestBytes = Buffer.byteLength(`${manifestJson}\n`, 'utf8');
  manifestDraft.fileSizes['manifest.json'] = manifestBytes;
  const finalManifestJson = JSON.stringify(manifestDraft, null, 2);

  const latestPointer = {
    snapshotId,
    contentHash,
    manifestPath: `/snapshots/${snapshotId}/manifest.json`,
  };
  const latestJson = JSON.stringify(latestPointer, null, 2);

  if (writeFiles) {
    const snapDir = path.join(outputRootDir, snapshotId);
    writeJsonFile(path.join(snapDir, 'galaxy.json'), galaxyJson);
    writeJsonFile(path.join(snapDir, 'planets.json'), planetsJson);
    writeJsonFile(path.join(snapDir, 'manifest.json'), finalManifestJson);
    writeJsonFile(path.join(outputRootDir, 'latest.json'), latestJson);
  }

  return {
    snapshotId,
    contentHash,
    rawCsvSha256: csvData.rawSha256,
    manifest: manifestDraft,
    latestPointer,
    galaxy,
    planets,
    planetCollisions: planetSlugger.getCollisions(),
    systemCollisions: systemSlugger.getCollisions(),
  };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const started = Date.now();
  const result = buildSnapshotFromCsv();
  const elapsedMs = Date.now() - started;
  console.log(`Built snapshot ${result.snapshotId} in ${elapsedMs} ms`);
  console.log(`  rawCsvSha256 : ${result.rawCsvSha256}`);
  console.log(`  contentHash  : ${result.contentHash}`);
  console.log(`  planets      : ${result.manifest.counts.planets}`);
  console.log(`  hosts        : ${result.manifest.counts.hosts}`);
  console.log(`  hostsWithPos : ${result.manifest.counts.hostsWithPosition}`);
  console.log(`  planetsWithPos: ${result.manifest.counts.planetsWithPosition}`);
  console.log(`  fileSizes    : ${JSON.stringify(result.manifest.fileSizes)}`);
}
