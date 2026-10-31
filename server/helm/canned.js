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
    return `${r.name} (radius ${radToken}, distance ${distToken}, ${zoneLabel})`;
  });

  const text =
    `Here are the ${rows.length} nearest confirmed planets in the snapshot with radii near Earth's size sitting in the optimistic habitable zone ` +
    `(${conservativeInTop} of these ${rows.length} sit in the conservative habitable zone): ` +
    `${itemDescriptions.join('; ')}. ` +
    `These orbital positions and radii are potential habitability indicators only—stellar activity, atmospheric retention, and composition remain uncertain. ` +
    `Note that transit and radial-velocity surveys carry strong observational detection bias toward short-period orbits around M-dwarf stars.`;

  const actions = [
    ...searchResult.actions,
    ...focusResult.actions,
  ];

  return { text, actions, toolCalls: ['search_planets', 'focus_camera'] };
}

/**
 * Canned Query #2:
 * "Which planets have the most disputed measurements?"
 */
function executeCanned2(snapshot) {
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

  return { text, actions, toolCalls: ['search_planets', 'focus_camera'] };
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
    `In the NASA Exoplanet Archive snapshot, TRAPPIST-1 e has radius ${radToken}, ${massProv} mass ${massToken}, orbital period ${perToken}, equilibrium temperature ${eqtToken}, and system distance ${distToken}. ` +
    `It orbits within the conservative habitable zone of an ultracool M-dwarf star; these metrics represent potential habitability indicators rather than evidence of a life-supporting atmosphere.`;

  const actions = [
    ...cmpResult.actions,
    ...focusResult.actions,
  ];

  return { text, actions, toolCalls: ['compare_planets', 'focus_camera'] };
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

  const text =
    `Setting the discovery timeline filter to show exoplanets discovered from 1992 through 2015 in the galaxy view. ` +
    `Discoveries in this era reflect strong observational detection bias: early radial-velocity surveys primarily detected massive close-in gas giants around nearby stars, while the Kepler mission added a narrow cone of transit discoveries.`;

  const actions = [
    ...timelineResult.actions,
    ...focusResult.actions,
  ];

  return { text, actions, toolCalls: ['open_timeline', 'focus_camera'] };
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
      limit: 1,
    },
    snapshot
  );

  const nearest = searchResult.rows?.[0];
  if (!nearest) {
    throw new Error('No planet with known distance found in snapshot');
  }

  const focusResult = focus_camera(
    { level: 'planet', targetId: nearest.id },
    snapshot
  );

  const distToken = formatFieldReceiptOrUnknown(nearest.fields.sy_dist);
  const radToken = formatFieldReceiptOrUnknown(nearest.fields.pl_rade);
  const massToken = formatFieldReceiptOrUnknown(nearest.fields.pl_bmasse);
  const perToken = formatFieldReceiptOrUnknown(nearest.fields.pl_orbper);
  const eqtToken = formatFieldReceiptOrUnknown(nearest.fields.pl_eqt);
  const massProv = nearest.massProvenanceLabel || 'unknown';
  const hzLabel =
    nearest.hzStatus === 'in_conservative'
      ? 'conservative habitable zone'
      : nearest.hzStatus === 'in_optimistic_only'
        ? 'optimistic habitable zone'
        : 'outside the estimated habitable zone';

  const text =
    `Focusing the camera on ${nearest.name}, the nearest confirmed exoplanet in the snapshot at a distance of ${distToken}. ` +
    `Archive records report a radius of ${radToken}, a ${massProv} mass of ${massToken}, an orbital period of ${perToken}, and an equilibrium temperature of ${eqtToken}. ` +
    `${nearest.name} orbits within its host star's ${hzLabel}, which is one of several potential habitability indicators (subject to M-dwarf stellar flare activity and radial-velocity inclination uncertainty).`;

  const actions = [
    { type: 'highlight', ids: [nearest.id], mode: 'set' },
    ...focusResult.actions,
  ];

  return { text, actions, toolCalls: ['search_planets', 'focus_camera'] };
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
      notice: null,
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
    return `${r.name} (distance ${distToken}, radius ${radToken})`;
  });

  const text =
    `Showing ${rows.length} confirmed planets from the snapshot sorted by distance: ${items.join('; ')}. ` +
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
        'Using deterministic snapshot search (live AI model is disabled or unavailable).',
    },
  });
}
