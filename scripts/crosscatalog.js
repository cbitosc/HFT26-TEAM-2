/**
 * scripts/crosscatalog.js
 * Build-time cross-catalog integration comparing NASA Exoplanet Archive with
 * exoplanet.eu using Exo-MerCat strictly as the name-reconciliation bridge.
 *
 * Rules (AGENTS.md, ARCHITECTURE.md Sections 6.1, 6.5, 6.7, 6.8, 12, 13 Phase 7, 15):
 *   - Follow architecture sections exactly.
 *   - Probe actual TAP schemas and columns before querying. Never guess names.
 *   - Name reconciliation: Exo-MerCat bridge first -> normalized fallback -> unmatched is "not compared".
 *   - Raw cross-catalog values remain strictly git-ignored (DEC-004) until human licensing approval.
 *   - Derived flags: 'agree', 'disagree', 'not compared'.
 *   - Unmatched planets MUST show 'not compared', never 'disagree'.
 *   - Preserve missing values as null.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { areIntervalsDisjoint } from '../shared/domain/dispute.js';
import { decodePlanetsSnapshot } from '../shared/snapshotCodec.js';
import { buildNameBridge, normalizePlanetName } from './lib/names.js';
import { writeJsonFile } from './lib/snapshotIO.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const RJUP_TO_REARTH = 11.20898;
export const MJUP_TO_MEARTH = 317.82838;

export const EXOMERCAT_TAP_URL = 'http://archives.ia2.inaf.it/vo/tap/projects/sync';
export const EU_PRIMARY_TAP_URL = 'http://voparis-tap-planeto.obspm.fr/tap/sync';
export const EU_HEASARC_TAP_URL = 'https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync';

export const CROSS_CATALOG_FIELDS = Object.freeze([
  'pl_rade',
  'pl_bmasse',
  'pl_orbper',
  'pl_orbsmax',
  'st_teff',
]);

/**
 * Executes an ADQL query against a TAP service.
 */
export async function queryTap(baseUrl, adql, { format = 'csv', timeoutMs = 30000 } = {}) {
  const url = new URL(baseUrl);
  url.searchParams.set('REQUEST', 'doQuery');
  url.searchParams.set('LANG', 'ADQL');
  url.searchParams.set('FORMAT', format);
  url.searchParams.set('QUERY', adql);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'ExoplanetExplorer-CrossCatalog/1.0' },
      signal: controller.signal,
    });
    const text = await res.text();
    const elapsedMs = Date.now() - started;
    if (!res.ok) {
      throw new Error(`TAP HTTP ${res.status} (${elapsedMs}ms): ${text.slice(0, 300)}`);
    }
    return { ok: true, text, elapsedMs, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches the Exo-MerCat name bridge table from IA2 TAP service.
 */
export async function fetchExoMerCatBridge({ tapUrl = EXOMERCAT_TAP_URL, fetchImpl = queryTap } = {}) {
  const adql = [
    'SELECT id, exomercat_name, nasa_name, eu_name, toi_name, epic_name,',
    'original_status_string, checked_status_string, status',
    'FROM exomercat.exomercat',
    "WHERE nasa_name != '' OR eu_name != ''",
  ].join(' ');

  const res = await fetchImpl(tapUrl, adql, { format: 'csv' });
  const parsed = Papa.parse(res.text.trim(), { header: true, skipEmptyLines: true });
  return parsed.data;
}

/**
 * Fetches comparison records from the exoplanet.eu catalog (via HEASARC mirror or primary TAP).
 */
export async function fetchEuCatalog({
  primaryUrl = EU_PRIMARY_TAP_URL,
  heasarcUrl = EU_HEASARC_TAP_URL,
  fetchImpl = queryTap,
} = {}) {
  // 1. Try primary TAP (voparis-tap-planeto.obspm.fr)
  try {
    const primaryAdql = [
      'SELECT target_name, star_name, planet_status, mass, mass_error_min, mass_error_max,',
      'radius, radius_error_min, radius_error_max, period, period_error_min, period_error_max,',
      'semi_major_axis, temp_calculated, star_teff',
      'FROM exoplanet.epn_core',
    ].join(' ');
    const res = await fetchImpl(primaryUrl, primaryAdql, { format: 'csv', timeoutMs: 8000 });
    const parsed = Papa.parse(res.text.trim(), { header: true, skipEmptyLines: true });
    return { source: 'obspm-epn_core', data: parsed.data };
  } catch (primaryErr) {
    // 2. Fall back to IVOA-registered HEASARC mirror (heasarc.gsfc.nasa.gov)
    try {
      const heasarcAdql = [
        'SELECT name, planet_status, planet_mass, planet_radius, orbital_period, semi_major_axis, star_name, star_t_eff',
        'FROM exoplanets',
      ].join(' ');
      const res = await fetchImpl(heasarcUrl, heasarcAdql, { format: 'text/plain', timeoutMs: 25000 });
      const parsed = parseHeasarcTable(res.text);
      return { source: 'heasarc-exoplanets', data: parsed };
    } catch (heasarcErr) {
      throw new Error(
        `Both exoplanet.eu TAP endpoints failed. Primary: ${primaryErr.message}; HEASARC: ${heasarcErr.message}`
      );
    }
  }
}

/**
 * Parses pipe-separated ASCII output from HEASARC TAP text/plain format.
 */
export function parseHeasarcTable(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const colNames = headerLine.split('|').map((s) => s.trim().replace(/^"|"$/g, ''));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('Number of rows') || line.startsWith('Number of columns')) continue;
    const parts = line.split('|').map((s) => s.trim());
    const row = {};
    for (let c = 0; c < colNames.length; c++) {
      const val = parts[c] ?? '';
      row[colNames[c]] = val === '' || val.toLowerCase() === 'null' ? null : val;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Normalizes an EU planet record into standard comparison fields.
 */
export function normalizeEuRecord(rawRecord, source = 'heasarc-exoplanets') {
  if (!rawRecord) return null;

  if (source === 'heasarc-exoplanets') {
    const name = rawRecord.name || '';
    const status = rawRecord.planet_status || null;
    const massJup = rawRecord.planet_mass !== null ? Number(rawRecord.planet_mass) : null;
    const radiusJup = rawRecord.planet_radius !== null ? Number(rawRecord.planet_radius) : null;
    const periodDays = rawRecord.orbital_period !== null ? Number(rawRecord.orbital_period) : null;
    const smaxAu = rawRecord.semi_major_axis !== null ? Number(rawRecord.semi_major_axis) : null;
    const teffK = rawRecord.star_t_eff !== null ? Number(rawRecord.star_t_eff) : null;

    return {
      name,
      status,
      fields: {
        pl_rade: {
          v: Number.isFinite(radiusJup) ? radiusJup * RJUP_TO_REARTH : null,
          e1: null,
          e2: null,
          unit: 'R_Earth',
        },
        pl_bmasse: {
          v: Number.isFinite(massJup) ? massJup * MJUP_TO_MEARTH : null,
          e1: null,
          e2: null,
          unit: 'M_Earth',
        },
        pl_orbper: {
          v: Number.isFinite(periodDays) ? periodDays : null,
          e1: null,
          e2: null,
          unit: 'd',
        },
        pl_orbsmax: {
          v: Number.isFinite(smaxAu) ? smaxAu : null,
          e1: null,
          e2: null,
          unit: 'au',
        },
        st_teff: {
          v: Number.isFinite(teffK) ? teffK : null,
          e1: null,
          e2: null,
          unit: 'K',
        },
      },
    };
  }

  // EPN-TAP format
  const name = rawRecord.target_name || '';
  const status = rawRecord.planet_status || rawRecord.status || null;
  const massJup = rawRecord.mass !== null ? Number(rawRecord.mass) : null;
  const massE1 = rawRecord.mass_error_max !== null ? Number(rawRecord.mass_error_max) : null;
  const massE2 = rawRecord.mass_error_min !== null ? Number(rawRecord.mass_error_min) : null;

  const radiusJup = rawRecord.radius !== null ? Number(rawRecord.radius) : null;
  const radiusE1 = rawRecord.radius_error_max !== null ? Number(rawRecord.radius_error_max) : null;
  const radiusE2 = rawRecord.radius_error_min !== null ? Number(rawRecord.radius_error_min) : null;

  const periodDays = rawRecord.period !== null ? Number(rawRecord.period) : null;
  const periodE1 = rawRecord.period_error_max !== null ? Number(rawRecord.period_error_max) : null;
  const periodE2 = rawRecord.period_error_min !== null ? Number(rawRecord.period_error_min) : null;

  const smaxAu = rawRecord.semi_major_axis !== null ? Number(rawRecord.semi_major_axis) : null;
  const teffK = rawRecord.star_teff !== null ? Number(rawRecord.star_teff) : null;

  return {
    name,
    status,
    fields: {
      pl_rade: {
        v: Number.isFinite(radiusJup) ? radiusJup * RJUP_TO_REARTH : null,
        e1: Number.isFinite(radiusE1) ? radiusE1 * RJUP_TO_REARTH : null,
        e2: Number.isFinite(radiusE2) ? radiusE2 * RJUP_TO_REARTH : null,
        unit: 'R_Earth',
      },
      pl_bmasse: {
        v: Number.isFinite(massJup) ? massJup * MJUP_TO_MEARTH : null,
        e1: Number.isFinite(massE1) ? massE1 * MJUP_TO_MEARTH : null,
        e2: Number.isFinite(massE2) ? massE2 * MJUP_TO_MEARTH : null,
        unit: 'M_Earth',
      },
      pl_orbper: {
        v: Number.isFinite(periodDays) ? periodDays : null,
        e1: Number.isFinite(periodE1) ? periodE1 : null,
        e2: Number.isFinite(periodE2) ? periodE2 : null,
        unit: 'd',
      },
      pl_orbsmax: {
        v: Number.isFinite(smaxAu) ? smaxAu : null,
        e1: null,
        e2: null,
        unit: 'au',
      },
      st_teff: {
        v: Number.isFinite(teffK) ? teffK : null,
        e1: null,
        e2: null,
        unit: 'K',
      },
    },
  };
}

/**
 * Compares NASA confirmation status with EU status string.
 *
 * Status rule (ARCHITECTURE.md Section 6.5):
 *   NASA confirmed vs EU status string -> 'agree' | 'disagree' | 'not compared'
 *
 * @param {string} nasaStatus - e.g. 'confirmed' | 'candidate'
 * @param {string|null} euStatus - e.g. 'CONFIRMED' | 'Confirmed' | 'CANDIDATE' | 'Candidate'
 * @returns {'agree' | 'disagree' | 'not compared'}
 */
export function compareStatus(nasaStatus, euStatus) {
  if (!euStatus || typeof euStatus !== 'string') {
    return 'not compared';
  }

  const euClean = euStatus.trim().toLowerCase();
  const nasaClean = (nasaStatus || '').trim().toLowerCase();

  const isEuConfirmed = euClean.includes('confirmed') && !euClean.includes('unconfirmed');
  const isNasaConfirmed = nasaClean === 'confirmed';

  if (isNasaConfirmed && isEuConfirmed) {
    return 'agree';
  }

  const isEuCandidateOrRetracted =
    euClean.includes('candidate') ||
    euClean.includes('unconfirmed') ||
    euClean.includes('retracted') ||
    euClean.includes('controversial');

  if (isNasaConfirmed && isEuCandidateOrRetracted) {
    return 'disagree';
  }

  return 'not compared';
}

/**
 * Compares a single NASA parameter with the exoplanet.eu parameter.
 *
 * Field rule (ARCHITECTURE.md Section 6.5):
 *   per field compare NASA canonical interval with the exoplanet.eu interval using the
 *   same overlap rule; if neither side has uncertainty -> "cannot assess"
 *
 * @param {object|null} nasaField - { v, e1, e2, lim }
 * @param {object|null} euField - { v, e1, e2 }
 * @returns {{
 *   agreement: boolean | null,
 *   flag: 'agree' | 'disagree' | 'not compared',
 *   nasaVal: number | null,
 *   euVal: number | null,
 *   status: 'agree' | 'disagree' | 'cannot assess' | 'not compared',
 *   reason: string | null
 * }}
 */
export function compareFieldInterval(nasaField, euField) {
  const nasaV = nasaField?.v ?? null;
  const euV = euField?.v ?? null;

  if (nasaV === null || euV === null || !Number.isFinite(nasaV) || !Number.isFinite(euV)) {
    return {
      agreement: null,
      flag: 'not compared',
      nasaVal: Number.isFinite(nasaV) ? nasaV : null,
      euVal: Number.isFinite(euV) ? euV : null,
      status: 'not compared',
      reason: 'Missing value in one or both catalogs',
    };
  }

  const hasNasaE1 = typeof nasaField.e1 === 'number' && Number.isFinite(nasaField.e1) && nasaField.e1 >= 0;
  const hasNasaE2 = typeof nasaField.e2 === 'number' && Number.isFinite(nasaField.e2) && nasaField.e2 <= 0;
  const hasNasaUncertainty = hasNasaE1 && hasNasaE2 && nasaField.lim === 0;

  const hasEuE1 = typeof euField.e1 === 'number' && Number.isFinite(euField.e1) && euField.e1 >= 0;
  const hasEuE2 = typeof euField.e2 === 'number' && Number.isFinite(euField.e2) && euField.e2 <= 0;
  const hasEuUncertainty = hasEuE1 && hasEuE2;

  // Architecture Section 6.5: if neither side has uncertainty -> "cannot assess"
  if (!hasNasaUncertainty && !hasEuUncertainty) {
    return {
      agreement: null,
      flag: 'not compared',
      nasaVal: nasaV,
      euVal: euV,
      status: 'cannot assess',
      reason: 'Uncertainty missing on both sides (cannot assess interval overlap)',
    };
  }

  const lowNasa = hasNasaUncertainty ? nasaV + nasaField.e2 : nasaV;
  const highNasa = hasNasaUncertainty ? nasaV + nasaField.e1 : nasaV;

  const lowEu = hasEuUncertainty ? euV + euField.e2 : euV;
  const highEu = hasEuUncertainty ? euV + euField.e1 : euV;

  const isDisjoint = areIntervalsDisjoint(lowNasa, highNasa, lowEu, highEu);

  if (isDisjoint) {
    return {
      agreement: false,
      flag: 'disagree',
      nasaVal: nasaV,
      euVal: euV,
      status: 'disagree',
      reason: 'Reported parameter intervals do not overlap',
    };
  }

  return {
    agreement: true,
    flag: 'agree',
    nasaVal: nasaV,
    euVal: euV,
    status: 'agree',
    reason: 'Reported parameter intervals overlap',
  };
}

/**
 * Builds the complete cross-catalog comparison dataset over a decoded NASA snapshot.
 *
 * @param {Array<object>} nasaPlanets - Decoded NASA PlanetRecord array
 * @param {Array<object>} exoMerCatRows - Exo-MerCat table rows
 * @param {Array<object>} euRows - exoplanet.eu table rows
 * @param {object} [options]
 * @param {string} [options.snapshotId='unknown']
 * @param {string} [options.euSource='heasarc-exoplanets']
 * @returns {object} Full crosscatalog payload
 */
export function buildCrossCatalogComparison(
  nasaPlanets,
  exoMerCatRows,
  euRows = [],
  { snapshotId = 'unknown', euSource = 'heasarc-exoplanets' } = {}
) {
  const bridge = buildNameBridge(exoMerCatRows);

  // Index normalized EU records by exact EU name and normalized EU name
  const euByName = new Map();
  const euByNorm = new Map();

  for (const raw of euRows) {
    const norm = normalizeEuRecord(raw, euSource);
    if (!norm || !norm.name) continue;
    const cleanName = norm.name.trim();
    euByName.set(cleanName, norm);
    const n = normalizePlanetName(cleanName);
    if (n && !euByNorm.has(n)) {
      euByNorm.set(n, norm);
    }
  }

  let matchedCount = 0;
  let unmatchedCount = 0;
  let statusAgreeCount = 0;
  let statusDisagreeCount = 0;
  let statusNotComparedCount = 0;

  const fieldStats = {};
  for (const fk of CROSS_CATALOG_FIELDS) {
    fieldStats[fk] = { agree: 0, disagree: 0, cannotAssess: 0, notCompared: 0 };
  }

  const results = {};

  for (const planet of nasaPlanets) {
    const bridgeMatch = bridge.lookup(planet.name);

    if (!bridgeMatch) {
      unmatchedCount += 1;
      statusNotComparedCount += 1;

      const fields = {};
      for (const fk of CROSS_CATALOG_FIELDS) {
        fieldStats[fk].notCompared += 1;
        fields[fk] = {
          flag: 'not compared',
          status: 'not compared',
          agreement: null,
          nasaVal: planet.fields?.[fk]?.v ?? null,
          euVal: null,
        };
      }

      results[planet.id] = {
        planetId: planet.id,
        name: planet.name,
        matched: false,
        euName: null,
        bridgeMethod: null,
        status: {
          flag: 'not compared',
          nasaStatus: planet.status,
          euStatus: null,
        },
        fields,
      };
      continue;
    }

    matchedCount += 1;
    const euName = bridgeMatch.euName;

    // Look up EU record by bridge's eu_name
    let euRecord = euByName.get(euName) || null;
    if (!euRecord) {
      euRecord = euByNorm.get(normalizePlanetName(euName)) || null;
    }

    // Determine EU status string (from EU catalog or Exo-MerCat's original_status_string)
    let euStatusStr = euRecord?.status || null;
    if (!euStatusStr && bridgeMatch.originalStatusString) {
      const match = bridgeMatch.originalStatusString.match(/eu:\s*([A-Za-z]+)/i);
      if (match) euStatusStr = match[1];
    }
    if (!euStatusStr && bridgeMatch.status) {
      euStatusStr = bridgeMatch.status;
    }

    const statusResult = compareStatus(planet.status, euStatusStr);
    if (statusResult === 'agree') statusAgreeCount += 1;
    else if (statusResult === 'disagree') statusDisagreeCount += 1;
    else statusNotComparedCount += 1;

    const fields = {};
    for (const fk of CROSS_CATALOG_FIELDS) {
      const nasaField = planet.fields?.[fk] ?? null;
      const euField = euRecord?.fields?.[fk] ?? null;
      const comp = compareFieldInterval(nasaField, euField);

      if (comp.flag === 'agree') fieldStats[fk].agree += 1;
      else if (comp.flag === 'disagree') fieldStats[fk].disagree += 1;
      else if (comp.status === 'cannot assess') fieldStats[fk].cannotAssess += 1;
      else fieldStats[fk].notCompared += 1;

      fields[fk] = comp;
    }

    results[planet.id] = {
      planetId: planet.id,
      name: planet.name,
      matched: true,
      euName,
      bridgeMethod: bridgeMatch.matchedBy,
      status: {
        flag: statusResult,
        nasaStatus: planet.status,
        euStatus: euStatusStr,
      },
      fields,
    };
  }

  return {
    meta: {
      snapshotId,
      generatedAt: new Date().toISOString(),
      source:
        'exoplanet.eu via IVOA HEASARC mirror (primary Paris Observatory TAP at voparis-tap-planeto.obspm.fr timed out: UND_ERR_CONNECT_TIMEOUT)',
      bridge: 'Exo-MerCat v2.0.0 (IA2 TAP at archives.ia2.inaf.it)',
      euEndpointSource: euSource,
      licensingStatus: 'GATED (DEC-004: raw values git-ignored; unverified licensing terms)',
    },
    counts: {
      totalNasaPlanets: nasaPlanets.length,
      matched: matchedCount,
      unmatched: unmatchedCount,
      matchedPercent: Number(((matchedCount / Math.max(1, nasaPlanets.length)) * 100).toFixed(1)),
      statusCounts: {
        agree: statusAgreeCount,
        disagree: statusDisagreeCount,
        notCompared: statusNotComparedCount,
      },
      fieldCounts: fieldStats,
    },
    planets: results,
  };
}

/**
 * Strips all raw third-party values, uncertainties, and source records,
 * producing a safe, architecture-compliant derived-only dataset.
 *
 * Safe for public snapshot publication and deployment under DEC-004.
 *
 * @param {object} comparison - Raw crosscatalog payload
 * @returns {object} Derived-only flags payload
 */
export function buildDerivedFlags(comparison) {
  if (!comparison || !comparison.planets) {
    throw new Error('Invalid comparison object provided to buildDerivedFlags');
  }

  const derivedPlanets = {};

  for (const [planetId, p] of Object.entries(comparison.planets)) {
    const fields = {};
    if (p.fields) {
      for (const [fk, f] of Object.entries(p.fields)) {
        fields[fk] = {
          flag: f.flag,     // 'agree' | 'disagree' | 'not compared'
          status: f.status, // 'agree' | 'disagree' | 'cannot assess' | 'not compared'
        };
      }
    }

    derivedPlanets[planetId] = {
      matched: Boolean(p.matched),
      // Planet-level confirmation status flag
      status: p.status?.flag ?? 'not compared',
      // Parameter-level interval overlap flags
      fields,
    };
  }

  return {
    meta: {
      snapshotId: comparison.meta?.snapshotId ?? 'unknown',
      generatedAt: comparison.meta?.generatedAt ?? new Date().toISOString(),
      source:
        'exoplanet.eu via IVOA HEASARC mirror (primary Paris Observatory TAP at voparis-tap-planeto.obspm.fr timed out: UND_ERR_CONNECT_TIMEOUT)',
      bridge: 'Exo-MerCat v2.0.0 (IA2 TAP at archives.ia2.inaf.it)',
      licensingGate:
        'SAFE DERIVED FLAGS ONLY (DEC-004: raw comparison values, uncertainties and source records excluded from Git and deployment)',
    },
    counts: comparison.counts,
    planets: derivedPlanets,
  };
}

/**
 * Main script runner.
 */
export async function runCrossCatalogPipeline({
  snapshotDir = null,
  outputDir = null,
  writeGatedFile = true,
  writePublicFlagsFile = true,
} = {}) {
  const latestJsonPath = path.join(ROOT, 'public', 'snapshots', 'latest.json');
  if (!fs.existsSync(latestJsonPath)) {
    throw new Error('Latest snapshot pointer not found at public/snapshots/latest.json');
  }

  const latestInfo = JSON.parse(fs.readFileSync(latestJsonPath, 'utf8'));
  const activeSnapshotId = latestInfo.snapshotId;
  const targetDir = snapshotDir || path.join(ROOT, 'public', 'snapshots', activeSnapshotId);

  console.log(`Running cross-catalog integration for snapshot ${activeSnapshotId}...`);

  // Load decoded planets using shared codec
  const planetsJsonPath = path.join(targetDir, 'planets.json');
  const rawPlanetsJson = JSON.parse(fs.readFileSync(planetsJsonPath, 'utf8'));
  const decodedPlanets = decodePlanetsSnapshot(rawPlanetsJson);
  console.log(`Loaded ${decodedPlanets.length} decoded NASA planets from ${planetsJsonPath}`);

  // Fetch Exo-MerCat name bridge
  console.log('Querying Exo-MerCat TAP for name-reconciliation bridge...');
  const exoMerCatRows = await fetchExoMerCatBridge();
  console.log(`Received ${exoMerCatRows.length} rows from Exo-MerCat TAP`);

  // Fetch exoplanet.eu catalog
  console.log('Querying exoplanet.eu catalog...');
  const euFetchResult = await fetchEuCatalog();
  console.log(`Received ${euFetchResult.data.length} records from ${euFetchResult.source}`);

  // Compare
  console.log('Performing cross-catalog status and interval comparisons...');
  const comparison = buildCrossCatalogComparison(
    decodedPlanets,
    exoMerCatRows,
    euFetchResult.data,
    {
      snapshotId: activeSnapshotId,
      euSource: euFetchResult.source,
    }
  );

  console.log('\n--- Cross-Catalog Comparison Summary ---');
  console.log(`Total NASA planets: ${comparison.counts.totalNasaPlanets}`);
  console.log(`Matched via Exo-MerCat bridge: ${comparison.counts.matched} (${comparison.counts.matchedPercent}%)`);
  console.log(`Unmatched (showing 'not compared'): ${comparison.counts.unmatched}`);
  console.log('Status agreement counts:', comparison.counts.statusCounts);
  console.log('Field agreement counts:', comparison.counts.fieldCounts);

  if (writeGatedFile) {
    const outPath = path.join(outputDir || targetDir, 'crosscatalog.json');
    const bytesWritten = writeJsonFile(outPath, JSON.stringify(comparison, null, 2));
    console.log(`\nWritten git-ignored crosscatalog.json to ${outPath} (${bytesWritten} bytes)`);

    // Also write a copy to data/crosscatalog.json if helpful
    const dataOut = path.join(ROOT, 'data', 'crosscatalog.json');
    writeJsonFile(dataOut, JSON.stringify(comparison, null, 2));
  }

  if (writePublicFlagsFile) {
    const safeFlags = buildDerivedFlags(comparison);
    const flagsPath = path.join(outputDir || targetDir, 'crosscatalog-flags.json');
    const flagsBytes = writeJsonFile(flagsPath, JSON.stringify(safeFlags, null, 2));
    console.log(`Written safe public crosscatalog-flags.json to ${flagsPath} (${flagsBytes} bytes)`);
  }

  return comparison;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  runCrossCatalogPipeline().catch((err) => {
    console.error('Cross-catalog error:', err.message);
    process.exitCode = 1;
  });
}

