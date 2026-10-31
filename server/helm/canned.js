/**
 * server/helm/canned.js
 * Deterministic, non-AI execution of the 5 canonical HELM canned queries
 * (ARCHITECTURE.md Section 8.7) using the typed tools (`search_planets`,
 * `focus_camera`, `compare_planets`, `open_timeline`) over the decoded snapshot.
 */

import { HelmResponseSchema } from '../../shared/schemas.js';
import {
  search_planets,
  focus_camera,
  compare_planets,
  open_timeline,
  formatFieldSummary,
} from './tools.js';
import { validateHelmOutput } from './validate.js';

export const CANNED_QUERIES = Object.freeze([
  {
    id: 'canned-1',
    number: 1,
    prompt: "Which planets are about Earth's size and sit in the habitable zone?",
    shortLabel: 'Earth-sized in HZ',
    matchPatterns: [
      /earth'?s?\s+size.*habitable\s+zone/i,
      /earth[-\s]sized.*habitable\s+zone/i,
      /^canned-1$/i,
    ],
  },
  {
    id: 'canned-2',
    number: 2,
    prompt: 'Which planets have the most disputed measurements?',
    shortLabel: 'Most disputed planets',
    matchPatterns: [
      /most\s+disputed\s+measurements/i,
      /contested\s+measurements/i,
      /^canned-2$/i,
    ],
  },
  {
    id: 'canned-3',
    number: 3,
    prompt: 'Compare TRAPPIST-1 e with Earth.',
    shortLabel: 'Compare TRAPPIST-1 e & Earth',
    matchPatterns: [
      /compare\s+trappist-1\s*e\s+with\s+earth/i,
      /^canned-3$/i,
    ],
  },
  {
    id: 'canned-4',
    number: 4,
    prompt: 'Show discoveries through 2015.',
    shortLabel: 'Discoveries through 2015',
    matchPatterns: [
      /discoveries\s+through\s+2015/i,
      /timeline.*2015/i,
      /^canned-4$/i,
    ],
  },
  {
    id: 'canned-5',
    number: 5,
    prompt: 'Fly me to the nearest known exoplanet.',
    shortLabel: 'Nearest exoplanet',
    matchPatterns: [
      /fly\s+me\s+to\s+the\s+nearest\s+known\s+exoplanet/i,
      /nearest\s+known\s+exoplanet/i,
      /nearest\s+exoplanet/i,
      /^canned-5$/i,
    ],
  },
]);

/**
 * Matches an incoming query ID or prompt string to one of the 5 canned queries.
 */
export function matchCannedQuery(queryIdOrText) {
  if (typeof queryIdOrText !== 'string') return null;
  const trimmed = queryIdOrText.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  for (const cq of CANNED_QUERIES) {
    if (cq.id.toLowerCase() === lower || cq.prompt.toLowerCase() === lower) {
      return cq;
    }
    for (const pat of cq.matchPatterns) {
      if (pat.test(trimmed)) {
        return cq;
      }
    }
  }
  return null;
}

function formatFieldReceiptOrUnknown(fieldSummary) {
  if (!fieldSummary || fieldSummary.status !== 'known' || !fieldSummary.token) {
    return 'unknown';
  }
  return fieldSummary.token;
}

/**
 * Canned Query #1:
 * "Which planets are about Earth's size and sit in the habitable zone?"
 */
function executeCanned1(snapshot) {
  const searchResult = search_planets(
    {
      radiusEarth: { min: 0.8, max: 1.25 },
      hz: 'in_optimistic',
      sortBy: 'distance',
      sortDir: 'asc',
      limit: 6,
    },
    snapshot
  );

  const rows = searchResult.rows || [];
  const topPlanet = rows[0] || null;
  const conservativeInTop = rows.filter((r) => r.hzStatus === 'in_conservative').length;

  const focusResult = topPlanet
    ? focus_camera({ level: 'planet', targetId: topPlanet.id }, snapshot)
    : focus_camera({ level: 'galaxy' }, snapshot);

  const itemDescriptions = rows.map((r) => {
    const radToken = formatFieldReceiptOrUnknown(r.fields.pl_rade);
    const distToken = formatFieldReceiptOrUnknown(r.fields.sy_dist);
    const zoneLabel =
      r.hzStatus === 'in_conservative'
        ? 'conservative habitable zone'
        : 'optimistic habitable zone';
    return `${r.name} (radius ${radToken}, system/host distance ${distToken}, ${zoneLabel})`;
  });

  const text =
    `Here are the ${rows.length} nearest confirmed planets (sorted by system/host star distance) in the snapshot with radii near Earth's size sitting in the optimistic habitable zone ` +
    `(${conservativeInTop} of these ${rows.length} sit in the conservative habitable zone): ` +
    `${itemDescriptions.join('; ')}. ` +
    `These orbital positions and radii are potential habitability indicators only—stellar activity, atmospheric retention, and composition remain uncertain. ` +
    `Note that transit and radial-velocity surveys carry strong observational detection bias toward short-period orbits around M-dwarf stars.`;

  const actions = [
    ...searchResult.actions,
    ...focusResult.actions,
  ];

  return { text, actions, notice: null, toolCalls: ['search_planets', 'focus_camera'] };
}

/**
 * Canned Query #2:
 * "Which planets have the most disputed measurements?"
 */
function executeCanned2(snapshot) {
  const hasDisputeData =
    Array.isArray(snapshot.planets) &&
    snapshot.planets.some((p) => p.dispute?.available === true);

  if (!hasDisputeData) {
    const snapId = snapshot.snapshotId || '2026-10-30-79bb8609';
    const text =
      `Multi-solution parameter dispute data (DISPUTE) is currently unavailable in active snapshot ${snapId} because only the composite pscomppars table is loaded in Phase 1a. ` +
      `Joining the NASA Exoplanet Archive ps multi-solution table to compute per-field interval non-overlap is scheduled after the Phase 1a gate in Phase 1b. ` +
      `No planets are marked contested or uncontested when multi-solution data are absent.`;

    return {
      text,
      actions: [{ type: 'highlight', ids: [], mode: 'clear' }],
      notice: 'Multi-solution ps dispute data unavailable in Phase 1a snapshot (pending Phase 1b).',
      toolCalls: ['highlight'],
    };
  }

  const searchResult = search_planets(
    {
      contestedOnly: true,
      sortBy: 'nSolutions',
      sortDir: 'desc',
      limit: 6,
    },
    snapshot
  );

  const rows = searchResult.rows || [];
  const topPlanet = rows[0] || null;
  const focusResult = topPlanet
    ? focus_camera({ level: 'planet', targetId: topPlanet.id }, snapshot)
    : focus_camera({ level: 'galaxy' }, snapshot);

  const summaries = rows.map((r) => {
    const radToken = formatFieldReceiptOrUnknown(r.fields.pl_rade);
    const massToken = formatFieldReceiptOrUnknown(r.fields.pl_bmasse);
    return `${r.name} (default radius ${radToken}, mass ${massToken})`;
  });

  const text =
    `Here are ${rows.length} confirmed planets with contested parameter solutions across published archive studies: ` +
    `${summaries.join('; ')}. ` +
    `Open the DISPUTE tab on the selected planet card to inspect how published radius, mass, orbital period, eccentricity, and equilibrium temperature intervals fail to overlap within reported uncertainties.`;

  const actions = [
    ...searchResult.actions,
    ...focusResult.actions,
  ];

  return { text, actions, notice: null, toolCalls: ['search_planets', 'focus_camera'] };
}

/**
 * Canned Query #3:
 * "Compare TRAPPIST-1 e with Earth."
 */
function executeCanned3(snapshot) {
  const cmpResult = compare_planets(
    { planetIds: ['trappist-1-e', 'earth'] },
    snapshot
  );
  const focusResult = focus_camera(
    { level: 'planet', targetId: 'trappist-1-e' },
    snapshot
  );

  const trappist = cmpResult.planets?.find((p) => p.id === 'trappist-1-e');
  const radToken = formatFieldReceiptOrUnknown(trappist?.fields?.pl_rade);
  const massToken = formatFieldReceiptOrUnknown(trappist?.fields?.pl_bmasse);
  const perToken = formatFieldReceiptOrUnknown(trappist?.fields?.pl_orbper);
  const eqtToken = formatFieldReceiptOrUnknown(trappist?.fields?.pl_eqt);
  const distToken = formatFieldReceiptOrUnknown(trappist?.fields?.sy_dist);
  const massProv = trappist?.massProvenanceLabel ?? 'unknown';

  const text =
    `Opening the comparison view for TRAPPIST-1 e alongside the Earth reference record. ` +
    `In the NASA Exoplanet Archive snapshot, TRAPPIST-1 e has radius ${radToken}, ${massProv} mass ${massToken}, orbital period ${perToken}, equilibrium temperature ${eqtToken}, and system/host distance ${distToken}. ` +
    `It orbits within the conservative habitable zone of an ultracool M-dwarf star; these metrics represent potential habitability indicators rather than evidence of a life-supporting atmosphere.`;

  const actions = [
    ...cmpResult.actions,
    ...focusResult.actions,
  ];

  return { text, actions, notice: null, toolCalls: ['compare_planets', 'focus_camera'] };
}

/**
 * Canned Query #4:
 * "Show discoveries through 2015."
 */
function executeCanned4(snapshot) {
  const timelineResult = open_timeline(
    { throughYear: 2015, playing: false },
    snapshot
  );
  const focusResult = focus_camera({ level: 'galaxy' }, snapshot);

  const peg51 = snapshot.planetById?.get('51-peg-b');
  const kep186f = snapshot.planetById?.get('kepler-186-f');
  const milestoneParts = [];
  if (peg51?.fields?.pl_orbper?.v !== null && peg51?.fields?.pl_orbper?.v !== undefined) {
    const perToken = formatFieldReceiptOrUnknown(
      formatFieldSummary(peg51.id, 'pl_orbper', peg51.fields.pl_orbper)
    );
    const distToken = formatFieldReceiptOrUnknown(
      formatFieldSummary(peg51.id, 'sy_dist', peg51.fields.sy_dist)
    );
    milestoneParts.push(
      `${peg51.name} (discovered in 1995 with orbital period ${perToken} at system/host distance ${distToken})`
    );
  }
  if (kep186f?.fields?.pl_rade?.v !== null && kep186f?.fields?.pl_rade?.v !== undefined) {
    const radToken = formatFieldReceiptOrUnknown(
      formatFieldSummary(kep186f.id, 'pl_rade', kep186f.fields.pl_rade)
    );
    const distToken = formatFieldReceiptOrUnknown(
      formatFieldSummary(kep186f.id, 'sy_dist', kep186f.fields.sy_dist)
    );
    milestoneParts.push(
      `${kep186f.name} (discovered in 2014 with radius ${radToken} at system/host distance ${distToken})`
    );
  }

  const milestoneSentence =
    milestoneParts.length > 0
      ? `Notable archive milestones discovered by 2015 include ${milestoneParts.join(' and ')}. `
      : '';

  const text =
    `Setting the discovery timeline filter to show exoplanets discovered from 1992 through 2015 in the galaxy view. ` +
    milestoneSentence +
    `Discoveries in this era reflect strong observational detection bias: early radial-velocity surveys primarily detected massive close-in gas giants around nearby stars, while the Kepler mission added a narrow cone of transit discoveries.`;

  const actions = [
    ...timelineResult.actions,
    ...focusResult.actions,
  ];

  return { text, actions, notice: null, toolCalls: ['open_timeline', 'focus_camera'] };
}

/**
 * Canned Query #5:
 * "Fly me to the nearest known exoplanet."
 */
function executeCanned5(snapshot) {
  const searchResult = search_planets(
    {
      sortBy: 'distance',
      sortDir: 'asc',
      limit: 10,
    },
    snapshot
  );

  const withDist = (snapshot.planets || []).filter((p) => {
    if (p.status && p.status !== 'confirmed') return false;
    const v = p.fields?.sy_dist?.v;
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
  });

  if (withDist.length === 0 && (!searchResult.rows || searchResult.rows.length === 0)) {
    throw new Error('No planet with known distance found in snapshot');
  }

  let minDistPc = Infinity;
  for (const p of withDist) {
    if (p.fields.sy_dist.v < minDistPc) {
      minDistPc = p.fields.sy_dist.v;
    }
  }

  const tiedPlanets = withDist.filter(
    (p) => Math.abs(p.fields.sy_dist.v - minDistPc) <= 1e-9
  );

  const primary = tiedPlanets[0] || snapshot.planetById.get(searchResult.rows[0].id);
  const focusResult = focus_camera(
    { level: 'planet', targetId: primary.id },
    snapshot
  );

  if (tiedPlanets.length > 1) {
    const tieDescriptions = tiedPlanets.map((p) => {
      const pDist = formatFieldReceiptOrUnknown(
        formatFieldSummary(p.id, 'sy_dist', p.fields?.sy_dist)
      );
      const pRad = formatFieldReceiptOrUnknown(
        formatFieldSummary(p.id, 'pl_rade', p.fields?.pl_rade)
      );
      const pMass = formatFieldReceiptOrUnknown(
        formatFieldSummary(p.id, 'pl_bmasse', p.fields?.pl_bmasse)
      );
      const pPer = formatFieldReceiptOrUnknown(
        formatFieldSummary(p.id, 'pl_orbper', p.fields?.pl_orbper)
      );
      return `${p.name} (host ${p.hostname}, system/host distance ${pDist}, radius ${pRad}, ${p.massProvenanceLabel || 'unknown'} mass ${pMass}, orbital period ${pPer})`;
    });

    const primaryHzStatus = primary.hab?.hzPosition?.status ?? 'unknown';
    const primaryHzLabel =
      primaryHzStatus === 'in_conservative'
        ? 'conservative habitable zone'
        : primaryHzStatus === 'in_optimistic_only'
          ? 'optimistic habitable zone'
          : 'outside the estimated habitable zone';

    const text =
      `In the NASA Exoplanet Archive, sy_dist measures the system/host star distance from the Solar System rather than an instantaneous planet-to-Earth ephemeris distance, so multiple planets in the nearest host system (${primary.hostname}) tie on catalog distance. ` +
      `Found ${tiedPlanets.length} confirmed planets tied at the minimum system/host star distance in the snapshot: ${tieDescriptions.join('; ')}. ` +
      `Highlighting all ${tiedPlanets.length} tied planets and focusing the camera on ${primary.name}, which orbits within its host star's ${primaryHzLabel} (one of several potential habitability indicators, subject to M-dwarf stellar flare activity and radial-velocity inclination uncertainty).`;

    const actions = [
      { type: 'highlight', ids: tiedPlanets.map((p) => p.id), mode: 'set' },
      ...focusResult.actions,
    ];

    return { text, actions, notice: null, toolCalls: ['search_planets', 'focus_camera'] };
  }

  const distToken = formatFieldReceiptOrUnknown(
    formatFieldSummary(primary.id, 'sy_dist', primary.fields?.sy_dist)
  );
  const radToken = formatFieldReceiptOrUnknown(
    formatFieldSummary(primary.id, 'pl_rade', primary.fields?.pl_rade)
  );
  const massToken = formatFieldReceiptOrUnknown(
    formatFieldSummary(primary.id, 'pl_bmasse', primary.fields?.pl_bmasse)
  );
  const perToken = formatFieldReceiptOrUnknown(
    formatFieldSummary(primary.id, 'pl_orbper', primary.fields?.pl_orbper)
  );
  const eqtToken = formatFieldReceiptOrUnknown(
    formatFieldSummary(primary.id, 'pl_eqt', primary.fields?.pl_eqt)
  );
  const massProv = primary.massProvenanceLabel || 'unknown';
  const hzStatus = primary.hab?.hzPosition?.status ?? 'unknown';
  const hzLabel =
    hzStatus === 'in_conservative'
      ? 'conservative habitable zone'
      : hzStatus === 'in_optimistic_only'
        ? 'optimistic habitable zone'
        : 'outside the estimated habitable zone';
  const hostNote =
    primary.hostname === 'Proxima Cen'
      ? `${primary.hostname} (part of the Alpha Centauri triple system)`
      : primary.hostname;

  const text =
    `Focusing the camera on ${primary.name}, the nearest confirmed exoplanet in the snapshot at a system/host star distance (sy_dist) of ${distToken} around ${hostNote}. ` +
    `Note that catalog sy_dist measures the system/host star distance from the Solar System rather than an instantaneous planet-to-Earth ephemeris distance; ${primary.name} is the sole confirmed planet at this minimum system/host distance in the active pscomppars snapshot (whereas any additional planets sharing the same host distance would tie on sy_dist). ` +
    `Archive records report a radius of ${radToken}, a ${massProv} mass of ${massToken}, an orbital period of ${perToken}, and an equilibrium temperature of ${eqtToken}. ` +
    `${primary.name} orbits within its host star's ${hzLabel}, which is one of several potential habitability indicators (subject to M-dwarf stellar flare activity and radial-velocity inclination uncertainty).`;

  const actions = [
    { type: 'highlight', ids: [primary.id], mode: 'set' },
    ...focusResult.actions,
  ];

  return { text, actions, notice: null, toolCalls: ['search_planets', 'focus_camera'] };
}

/**
 * Executes a matched canned query against `snapshot`, validates the output with
 * `validateHelmOutput`, and returns a `HelmResponseSchema`-validated response object.
 */
export function executeCannedQuery(queryIdOrText, snapshot) {
  const matched = matchCannedQuery(queryIdOrText);
  if (!matched) {
    return null;
  }

  let rawResult;
  switch (matched.number) {
    case 1:
      rawResult = executeCanned1(snapshot);
      break;
    case 2:
      rawResult = executeCanned2(snapshot);
      break;
    case 3:
      rawResult = executeCanned3(snapshot);
      break;
    case 4:
      rawResult = executeCanned4(snapshot);
      break;
    case 5:
      rawResult = executeCanned5(snapshot);
      break;
    default:
      return null;
  }

  const validated = validateHelmOutput(
    { text: rawResult.text, actions: rawResult.actions },
    snapshot
  );

  if (!validated.ok) {
    throw new Error(
      `Canned query ${matched.id} failed output validation: ${validated.errors.join('; ')}`
    );
  }

  const response = {
    segments: validated.segments,
    actions: validated.validActions,
    meta: {
      snapshotId: snapshot.snapshotId,
      model: 'deterministic-canned',
      source: 'canned',
      notice: rawResult.notice ?? null,
    },
  };

  return HelmResponseSchema.parse(response);
}

/**
 * Deterministic fallback template generator when live AI is unavailable or fails validation.
 */
export function buildDeterministicFallback(message, snapshot, notice = null) {
  const canned = executeCannedQuery(message, snapshot);
  if (canned) {
    return {
      ...canned,
      meta: {
        ...canned.meta,
        notice: notice ?? canned.meta.notice,
      },
    };
  }

  const trimmed = String(message || '').trim();
  const searchResult = search_planets(
    {
      nameQuery: trimmed.length <= 60 ? trimmed : undefined,
      sortBy: 'distance',
      sortDir: 'asc',
      limit: 5,
    },
    snapshot
  );

  const rows =
    searchResult.rows && searchResult.rows.length > 0
      ? searchResult.rows
      : search_planets({ sortBy: 'distance', sortDir: 'asc', limit: 5 }, snapshot).rows;

  const top = rows[0];
  const focusActions = top
    ? focus_camera({ level: 'planet', targetId: top.id }, snapshot).actions
    : [];
  const highlightActions =
    rows.length > 0
      ? [{ type: 'highlight', ids: rows.map((r) => r.id), mode: 'set' }]
      : [];

  const items = rows.map((r) => {
    const distToken = formatFieldReceiptOrUnknown(r.fields.sy_dist);
    const radToken = formatFieldReceiptOrUnknown(r.fields.pl_rade);
    return `${r.name} (system/host distance ${distToken}, radius ${radToken})`;
  });

  const text =
    `Showing ${rows.length} confirmed planets from the snapshot sorted by system/host star distance: ${items.join('; ')}. ` +
    `Select any receipt chip to inspect its archive source reference and uncertainty bounds, or choose one of the canned queries.`;

  const validated = validateHelmOutput(
    { text, actions: [...highlightActions, ...focusActions] },
    snapshot
  );

  return HelmResponseSchema.parse({
    segments: validated.segments,
    actions: validated.validActions,
    meta: {
      snapshotId: snapshot.snapshotId,
      model: 'deterministic-fallback',
      source: 'fallback',
      notice:
        notice ??
        'Live AI astronomer is currently disabled pending human authorization; showing deterministic archive snapshot results.',
    },
  });
}
