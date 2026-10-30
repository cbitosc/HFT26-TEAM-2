/**
 * scripts/probe-tap.js
 * Read-only Phase 0 TAP probes for:
 *  1. NASA Exoplanet Archive `ps` (verifying `data/config/columns.ps.json` with a TOP 5 query)
 *  2. Exoplanet Encyclopaedia (exoplanet.eu) TAP at voparis-tap-planeto.obspm.fr
 *  3. Exo-MerCat TAP at archives.ia2.inaf.it
 *
 * Writes schema & probe reports to `docs/probes/*.md`. Copies no catalog data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROBES_DIR = path.join(ROOT, 'docs', 'probes');

fs.mkdirSync(PROBES_DIR, { recursive: true });

async function fetchTap(baseUrl, adql, format = 'csv', timeoutMs = 25000) {
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
      headers: { 'User-Agent': 'ExoplanetExplorer-Phase0Probe/1.0' },
      signal: controller.signal,
    });
    const text = await res.text();
    const elapsedMs = Date.now() - started;
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} (${elapsedMs}ms): ${text.slice(0, 300)}`);
    }
    if (text.trim().startsWith('<') && format === 'csv') {
      throw new Error(`Expected CSV but received XML/HTML (${elapsedMs}ms): ${text.slice(0, 400)}`);
    }
    return { text, elapsedMs, status: res.status, url: url.toString() };
  } finally {
    clearTimeout(timer);
  }
}

async function probeNasaPs() {
  console.log('Probing NASA Exoplanet Archive TAP (ps)...');
  const tapUrl = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
  const psConfig = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data', 'config', 'columns.ps.json'), 'utf8')
  );
  const cols = psConfig.columns;

  // 1. Query TAP_SCHEMA.columns for table 'ps'
  const schemaQuery = `SELECT column_name, datatype, description FROM TAP_SCHEMA.columns WHERE table_name = 'ps'`;
  const schemaRes = await fetchTap(tapUrl, schemaQuery, 'csv');
  const schemaParsed = Papa.parse(schemaRes.text.trim(), { header: true, skipEmptyLines: true });
  const actualPsCols = new Set(schemaParsed.data.map((r) => r.column_name));

  const missingCols = cols.filter((c) => !actualPsCols.has(c));

  // 2. Query TOP 5 using the whitelisted columns
  const top5Query = `SELECT TOP 5 ${cols.join(', ')} FROM ps`;
  const top5Res = await fetchTap(tapUrl, top5Query, 'csv');
  const top5Parsed = Papa.parse(top5Res.text.trim(), { header: true, skipEmptyLines: true });

  // 3. Also check total row count in ps
  const countQuery = `SELECT COUNT(*) AS total_rows FROM ps`;
  const countRes = await fetchTap(tapUrl, countQuery, 'csv');
  const countParsed = Papa.parse(countRes.text.trim(), { header: true, skipEmptyLines: true });
  const totalRows = countParsed.data?.[0]?.total_rows ?? 'unknown';

  const sampleRow = top5Parsed.data[0] || {};
  const md = [
    `# NASA Exoplanet Archive \`ps\` TAP Probe Report`,
    ``,
    `- **Probed at:** ${new Date().toISOString()}`,
    `- **Endpoint:** \`${tapUrl}\``,
    `- **Table:** \`ps\` (Planetary Systems, DOI \`10.26133/NEA12\`)`,
    `- **Total rows currently in \`ps\`:** ${totalRows}`,
    `- **Total columns in \`TAP_SCHEMA.columns\` for \`ps\`:** ${actualPsCols.size}`,
    `- **Whitelisted columns tested (${cols.length}):** \`${cols.join('`, `')}\``,
    `- **Missing whitelisted columns:** ${missingCols.length === 0 ? 'None (all 31 columns verified)' : missingCols.join(', ')}`,
    `- **TOP 5 query latency:** ${top5Res.elapsedMs} ms (returned ${top5Parsed.data.length} rows)`,
    ``,
    `## Sample Reference & Metadata Format in \`ps\` (Row 1: \`${sampleRow.pl_name || 'N/A'}\`)`,
    ``,
    `- \`default_flag\`: \`${sampleRow.default_flag ?? ''}\``,
    `- \`soltype\`: \`${sampleRow.soltype ?? ''}\``,
    `- \`rowupdate\`: \`${sampleRow.rowupdate ?? ''}\``,
    `- \`pl_pubdate\`: \`${sampleRow.pl_pubdate ?? ''}\``,
    `- \`pl_refname\`: \`${sampleRow.pl_refname ?? ''}\``,
    `- \`st_refname\`: \`${sampleRow.st_refname ?? ''}\``,
    `- \`sy_refname\`: \`${sampleRow.sy_refname ?? ''}\``,
    ``,
    `## Notes`,
    `- Unlike \`pscomppars\` (which uses per-parameter \`*_reflink\` columns and has no \`rowupdate\`), \`ps\` provides solution-level \`pl_refname\`, \`st_refname\`, \`sy_refname\` (as HTML anchor tags) and \`rowupdate\` (YYYY-MM-DD).`,
  ].join('\n');

  fs.writeFileSync(path.join(PROBES_DIR, 'nasa-ps.md'), md, 'utf8');
  console.log('NASA ps probe succeeded. Total ps rows:', totalRows, 'Missing cols:', missingCols);
  return { ok: true, totalRows, missingCols, elapsedMs: top5Res.elapsedMs };
}

async function probeExoplanetEu() {
  console.log('Probing exoplanet.eu TAP...');
  const endpoints = [
    'http://voparis-tap-planeto.obspm.fr/tap/sync',
    'https://voparis-tap-planeto.obspm.fr/tap/sync',
  ];
  let tapUrl = endpoints[0];
  let tablesParsed = null;
  let lastErr = null;

  for (const ep of endpoints) {
    try {
      const res = await fetchTap(
        ep,
        `SELECT schema_name, table_name, description FROM TAP_SCHEMA.tables WHERE table_name LIKE '%exoplanet%' OR schema_name LIKE '%exoplanet%'`,
        'csv'
      );
      tapUrl = ep;
      tablesParsed = Papa.parse(res.text.trim(), { header: true, skipEmptyLines: true });
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!tablesParsed) {
    const errCode = lastErr?.cause?.code || lastErr?.message || 'ConnectTimeoutError';
    const mdFallback = [
      `# Exoplanet Encyclopaedia (exoplanet.eu) TAP Probe Report`,
      ``,
      `- **Probed at:** ${new Date().toISOString()}`,
      `- **Endpoints Tested:** \`${endpoints.join('`, `')}\``,
      `- **Live Probe Status:** Unreachable from current network (\`${errCode}\` on \`voparis-tap-planeto.obspm.fr\`)`,
      `- **Standard EPN-TAP Table:** \`exoplanet.epn_core\` (IVOA ID \`ivo://padc.obspm.planeto/exoplanet/q/epn_core\`)`,
      ``,
      `## Documented \`exoplanet.epn_core\` Schema (EPN-TAP v2.0)`,
      `| Column | Unit | Maps to NASA Column | Notes |`,
      `|---|---|---|---|`,
      `| \`target_name\` | – | \`pl_name\` (via Exo-MerCat \`eu_name\`) | Planet designation in Exoplanet.eu |`,
      `| \`star_name\` | – | \`hostname\` | Host star designation |`,
      `| \`planet_status\` / \`status\` | – | Confirmed | Planet confirmation status |`,
      `| \`mass\` / \`mass_error_min\` / \`mass_error_max\` | \`M_Jup\` | \`pl_bmasse\` (\`M_Earth\`) | **Convert MJup to MEarth (× 317.82838)** before interval comparison |`,
      `| \`radius\` / \`radius_error_min\` / \`radius_error_max\` | \`R_Jup\` | \`pl_rade\` (\`R_Earth\`) | **Convert RJup to REarth (× 11.20898)** before interval comparison |`,
      `| \`period\` / \`period_error_min\` / \`period_error_max\` | \`d\` | \`pl_orbper\` (\`d\`) | Orbital period in days |`,
      `| \`temp_calculated\` / \`temp_measured\` | \`K\` | \`pl_eqt\` (\`K\`) | Equilibrium / measured temperature |`,
      `| \`star_teff\` / \`star_teff_error_min\` / \`star_teff_error_max\` | \`K\` | \`st_teff\` (\`K\`) | Stellar effective temperature |`,
      ``,
      `## Fallback Note (Architecture Section 15)`,
      `- Per Section 6.8 & Section 15: \`crosscatalog.json\` is Phase 7 (time-boxed, optional, and licensing-gated). If \`voparis-tap-planeto.obspm.fr\` remains unreachable in Phase 7, Exo-MerCat (\`exomercat.exomercat\`, which is live and includes \`eu_name\` and \`original_status_string\` / \`checked_status_string\`) provides status comparison, or the app ships without \`crosscatalog.json\` showing \`"not compared"\`.`,
    ].join('\n');
    fs.writeFileSync(path.join(PROBES_DIR, 'exoplanet-eu.md'), mdFallback, 'utf8');
    console.warn(`exoplanet.eu TAP unreachable (${errCode}); wrote diagnostic report to docs/probes/exoplanet-eu.md`);
    return { ok: false, unreachable: true, error: String(errCode), tableName: 'exoplanet.epn_core' };
  }

  const tableName = 'exoplanet.epn_core';
  const colRes = await fetchTap(
    tapUrl,
    `SELECT column_name, datatype, unit, ucd, description FROM TAP_SCHEMA.columns WHERE table_name = '${tableName}'`,
    'csv'
  );
  const colsParsed = Papa.parse(colRes.text.trim(), { header: true, skipEmptyLines: true });
  const allCols = colsParsed.data;

  // Probe TOP 5 with key columns if they exist
  const candidateCols = [
    'granule_uid',
    'target_name',
    'star_name',
    ' planet_status',
    'status',
    'detection_type',
    'mass',
    'mass_error_min',
    'mass_error_max',
    'radius',
    'radius_error_min',
    'radius_error_max',
    'period',
    'period_error_min',
    'period_error_max',
    'semi_major_axis',
    'eccentricity',
    'temp_calculated',
    'temp_measured',
    'star_teff',
    'star_teff_error_min',
    'star_teff_error_max',
    'star_radius',
    'star_mass',
    'star_distance',
    'ra',
    'dec',
    'c1min',
    'c2min',
    'modification_date',
    'release_date',
    'bibcode',
  ].map((s) => s.trim());

  const existingColNames = new Set(allCols.map((c) => c.column_name));
  const validProbeCols = candidateCols.filter((c) => existingColNames.has(c));

  const top5Res = await fetchTap(
    tapUrl,
    `SELECT TOP 5 ${validProbeCols.join(', ')} FROM ${tableName}`,
    'csv'
  );
  const top5Parsed = Papa.parse(top5Res.text.trim(), { header: true, skipEmptyLines: true });

  const countRes = await fetchTap(tapUrl, `SELECT COUNT(*) AS total_rows FROM ${tableName}`, 'csv');
  const countParsed = Papa.parse(countRes.text.trim(), { header: true, skipEmptyLines: true });
  const totalRows = countParsed.data?.[0]?.total_rows ?? 'unknown';

  const md = [
    `# Exoplanet Encyclopaedia (exoplanet.eu) TAP Probe Report`,
    ``,
    `- **Probed at:** ${new Date().toISOString()}`,
    `- **Working Endpoint:** \`${tapUrl}\``,
    `- **Discovered Table:** \`${tableName}\``,
    `- **Total rows in \`${tableName}\`:** ${totalRows}`,
    `- **Total columns in \`${tableName}\`:** ${allCols.length}`,
    `- **TOP 5 probe latency:** ${top5Res.elapsedMs} ms`,
    ``,
    `## Discovered Tables`,
    ...tablesParsed.data.map((t) => `- \`${t.table_name}\` (${t.schema_name}): ${t.description || ''}`),
    ``,
    `## Verified Relevant Columns in \`${tableName}\``,
    `| Column | Datatype | Unit | Description |`,
    `|---|---|---|---|`,
    ...allCols
      .filter((c) =>
        /target_name|star|mass|radius|period|semi_major|eccentricity|temp|status|detection|ra|dec|c1|c2|date|bib|altnames|discovered/i.test(
          c.column_name
        )
      )
      .map(
        (c) =>
          `| \`${c.column_name}\` | \`${c.datatype || ''}\` | \`${c.unit || ''}\` | ${(c.description || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')} |`
      ),
    ``,
    `## Key Unit & Schema Notes`,
    `- Notice whether \`mass\` and \`radius\` in \`exoplanet.epn_core\` are in **Jupiter** units (\`M_J\`, \`R_J\`) vs NASA's \`pl_bmasse\` / \`pl_rade\` in **Earth** units! Check the \`unit\` column above before computing cross-catalog DISPUTE in Phase 7.`,
    `- Sample Row 1 (\`target_name\`): \`${top5Parsed.data[0]?.target_name ?? 'N/A'}\` | status cols present: \`${allCols.filter((c) => c.column_name.includes('status')).map((c) => c.column_name).join(', ')}\`.`,
  ].join('\n');

  fs.writeFileSync(path.join(PROBES_DIR, 'exoplanet-eu.md'), md, 'utf8');
  console.log('exoplanet.eu probe succeeded. Total rows:', totalRows, 'Cols:', allCols.length);
  return { ok: true, tapUrl, tableName, totalRows, colCount: allCols.length };
}

async function probeExoMerCat() {
  console.log('Probing Exo-MerCat TAP...');
  const endpoints = [
    'http://archives.ia2.inaf.it/vo/tap/projects/sync',
    'https://archives.ia2.inaf.it/vo/tap/projects/sync',
  ];
  let tapUrl = endpoints[0];
  let tablesParsed = null;
  let lastErr = null;

  for (const ep of endpoints) {
    try {
      const res = await fetchTap(
        ep,
        `SELECT schema_name, table_name, description FROM TAP_SCHEMA.tables WHERE table_name LIKE '%exomercat%' OR schema_name LIKE '%exomercat%'`,
        'csv'
      );
      tapUrl = ep;
      tablesParsed = Papa.parse(res.text.trim(), { header: true, skipEmptyLines: true });
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!tablesParsed) {
    throw lastErr || new Error('Could not reach Exo-MerCat TAP');
  }

  const tableName =
    tablesParsed.data.find((t) => t.table_name === 'exomercat.exomercat')?.table_name ||
    tablesParsed.data[0]?.table_name ||
    'exomercat.exomercat';

  const colRes = await fetchTap(
    tapUrl,
    `SELECT column_name, datatype, unit, description FROM TAP_SCHEMA.columns WHERE table_name = '${tableName}'`,
    'csv'
  );
  const colsParsed = Papa.parse(colRes.text.trim(), { header: true, skipEmptyLines: true });
  const allCols = colsParsed.data;

  const top5Res = await fetchTap(tapUrl, `SELECT TOP 5 * FROM ${tableName}`, 'csv');
  const top5Parsed = Papa.parse(top5Res.text.trim(), { header: true, skipEmptyLines: true });

  const countRes = await fetchTap(tapUrl, `SELECT COUNT(*) AS total_rows FROM ${tableName}`, 'csv');
  const countParsed = Papa.parse(countRes.text.trim(), { header: true, skipEmptyLines: true });
  const totalRows = countParsed.data?.[0]?.total_rows ?? 'unknown';

  const md = [
    `# Exo-MerCat TAP Probe Report`,
    ``,
    `- **Probed at:** ${new Date().toISOString()}`,
    `- **Working Endpoint:** \`${tapUrl}\``,
    `- **Discovered Table:** \`${tableName}\``,
    `- **Total rows in \`${tableName}\`:** ${totalRows}`,
    `- **Total columns in \`${tableName}\`:** ${allCols.length}`,
    `- **TOP 5 probe latency:** ${top5Res.elapsedMs} ms`,
    ``,
    `## Discovered Tables`,
    ...tablesParsed.data.map((t) => `- \`${t.table_name}\` (${t.schema_name}): ${t.description || ''}`),
    ``,
    `## All Columns in \`${tableName}\``,
    `| Column | Datatype | Unit | Description |`,
    `|---|---|---|---|`,
    ...allCols.map(
      (c) =>
        `| \`${c.column_name}\` | \`${c.datatype || ''}\` | \`${c.unit || ''}\` | ${(c.description || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')} |`
    ),
    ``,
    `## Name-Bridge Columns Sample (Row 1)`,
    `\`\`\`json`,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(top5Parsed.data[0] || {}).filter(([k]) =>
          /name|host|alias|letter|catalog|status|ra|dec|id/i.test(k)
        )
      ),
      null,
      2
    ),
    `\`\`\``,
  ].join('\n');

  fs.writeFileSync(path.join(PROBES_DIR, 'exomercat.md'), md, 'utf8');
  console.log('Exo-MerCat probe succeeded. Total rows:', totalRows, 'Cols:', allCols.length);
  return { ok: true, tapUrl, tableName, totalRows, colCount: allCols.length };
}

async function main() {
  const results = {};
  for (const [name, fn] of [
    ['nasaPs', probeNasaPs],
    ['exoplanetEu', probeExoplanetEu],
    ['exoMerCat', probeExoMerCat],
  ]) {
    try {
      results[name] = await fn();
    } catch (err) {
      console.error(`Probe ${name} failed:`, err.message);
      results[name] = { ok: false, error: err.message };
    }
  }
  console.log('Probe summary:', JSON.stringify(results, null, 2));
  if (Object.values(results).some((r) => !r.ok)) {
    process.exitCode = 1;
  }
}

main();
