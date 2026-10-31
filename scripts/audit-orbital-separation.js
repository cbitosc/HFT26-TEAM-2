/**
 * scripts/audit-orbital-separation.js
 * Single bounded audit pass over data/raw/pscomppars.csv to verify:
 * 1. 2M0437 b status (archive pl_orbsmax preserved, but true orbital distance unestablished -> hzPosition unknown).
 * 2. Separation-risk methods (Imaging, Microlensing, Disk Kinematics).
 * 3. Exact counts across all 6,451 confirmed planets.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAndVerifyNasaCsv } from './lib/csv.js';
import { isTrueOrbitalDistanceEstablished } from '../shared/domain/kepler.js';
import { buildArchiveFieldFromRow, ARCHIVE_FIELD_SPECS } from './build-snapshot.js';
import { buildHzEdgeFields, classifyHzPosition } from '../shared/domain/hz.js';
import { resolveStellarLuminosityLinear } from '../shared/domain/luminosity.js';
import { evaluateHabLab } from '../shared/domain/habLab.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const pscompparsConfig = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'config', 'columns.pscomppars.json'), 'utf8')
);
const rawCsvPath = path.join(ROOT, 'data', 'raw', 'pscomppars.csv');

console.log('Running single bounded audit pass over NASA pscomppars.csv...');
const csvData = loadAndVerifyNasaCsv(rawCsvPath, pscompparsConfig.columns);

let total = csvData.rows.length;
let establishedCount = 0;
let unestablishedCount = 0;
let separationRiskCount = 0;
let imagingCount = 0;
let microlensingCount = 0;
let diskKinematicsCount = 0;

let specificPlanet2M0437b = null;

for (const row of csvData.rows) {
  const plName = row.pl_name?.trim();
  const discoveryMethod = row.discoverymethod?.trim() || null;

  const archiveFields = {};
  for (const spec of ARCHIVE_FIELD_SPECS) {
    archiveFields[spec.key] = buildArchiveFieldFromRow(row, spec, null);
  }

  const isRisk =
    discoveryMethod === 'Imaging' ||
    discoveryMethod === 'Microlensing' ||
    discoveryMethod === 'Disk Kinematics';

  if (isRisk) separationRiskCount++;
  if (discoveryMethod === 'Imaging') imagingCount++;
  if (discoveryMethod === 'Microlensing') microlensingCount++;
  if (discoveryMethod === 'Disk Kinematics') diskKinematicsCount++;

  const isEstablished = isTrueOrbitalDistanceEstablished(archiveFields, discoveryMethod);
  if (isEstablished) {
    establishedCount++;
  } else {
    unestablishedCount++;
  }

  if (plName === '2M0437 b') {
    const lumResult = resolveStellarLuminosityLinear(
      '2m0437-b',
      archiveFields.st_lum,
      archiveFields.st_rad,
      archiveFields.st_teff
    );
    const hzBuilt = buildHzEdgeFields('2m0437-b', archiveFields.st_teff, lumResult.field);
    const hab = evaluateHabLab({
      planetId: '2m0437-b',
      fields: archiveFields,
      hzEdges: hzBuilt.edges,
      lumRoute: lumResult.route,
      massProvenance: null,
      spectralTypeRaw: row.st_spectype?.trim() || null,
      completenessResult: { score: 0.5, presentCount: 6, totalCount: 12, field: { v: 0.5 } },
      discoveryMethod,
    });

    specificPlanet2M0437b = {
      plName,
      discoveryMethod,
      archiveOrbsmax: archiveFields.pl_orbsmax,
      archiveOrbper: archiveFields.pl_orbper,
      archiveOrbeccen: archiveFields.pl_orbeccen,
      isEstablished,
      habHzPosition: hab.hzPosition,
    };
  }
}

console.log(`Audit Summary:`);
console.log(`  Total planets audited: ${total}`);
console.log(`  Separation-risk methods: ${separationRiskCount} (Imaging: ${imagingCount}, Microlensing: ${microlensingCount}, Disk Kinematics: ${diskKinematicsCount})`);
console.log(`  True orbital distance established: ${establishedCount}`);
console.log(`  True orbital distance unestablished: ${unestablishedCount}`);
console.log(`2M0437 b Audit:`, JSON.stringify(specificPlanet2M0437b, null, 2));
