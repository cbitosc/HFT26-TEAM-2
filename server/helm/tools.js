/**
 * server/helm/tools.js
 * Server-side typed tool executors over the decoded snapshot.
 * Validates all arguments with Zod schemas from `shared/schemas.js`.
 * Never invents or zero-fills missing values (`null` -> status: 'unknown').
 */

import {
  PlanetFiltersSchema,
  GetPlanetToolArgsSchema,
  ComparePlanetsToolArgsSchema,
  FocusCameraToolArgsSchema,
  HighlightToolArgsSchema,
  OpenTimelineToolArgsSchema,
  ToolArgumentSchemasByName,
} from '../../shared/schemas.js';
import { applyFilters } from '../../shared/filters.js';
import { makeReceiptId, formatToken } from '../../shared/receipts.js';
import { resolveCanonicalPlanetId, resolveCanonicalSystemId } from './validate.js';

export const FIELD_UNITS = Object.freeze({
  pl_rade: 'R⊕',
  pl_bmasse: 'M⊕',
  pl_dens: 'g/cm³',
  pl_orbper: 'days',
  pl_orbsmax: 'AU',
  pl_orbeccen: '',
  pl_eqt: 'K',
  pl_insol: 'S⊕',
  st_teff: 'K',
  st_rad: 'R☉',
  st_mass: 'M☉',
  st_lum: 'log(L☉)',
  st_lum_linear: 'L☉',
  sy_dist: 'pc',
  hz_recent_venus: 'AU',
  hz_runaway_greenhouse: 'AU',
  hz_moist_greenhouse: 'AU',
  hz_max_greenhouse: 'AU',
  hz_early_mars: 'AU',
  completeness: '',
});

const COMPACT_SEARCH_FIELDS = Object.freeze([
  'pl_rade',
  'pl_bmasse',
  'pl_orbper',
  'pl_orbsmax',
  'pl_eqt',
  'pl_insol',
  'sy_dist',
]);

const REFERENCE_BODIES = Object.freeze({
  earth: {
    id: 'earth',
    name: 'Earth (Solar System Reference)',
    hostname: 'Sun',
    status: 'reference',
    planetClass: 'rocky',
    massProvenanceLabel: 'reference',
    fields: {
      pl_rade: { status: 'known', v: 1.0, unit: 'R⊕', type: 'reference', receipt: null, token: null },
      pl_bmasse: { status: 'known', v: 1.0, unit: 'M⊕', type: 'reference', receipt: null, token: null },
      pl_dens: { status: 'known', v: 5.51, unit: 'g/cm³', type: 'reference', receipt: null, token: null },
      pl_orbper: { status: 'known', v: 365.256, unit: 'days', type: 'reference', receipt: null, token: null },
      pl_orbsmax: { status: 'known', v: 1.0, unit: 'AU', type: 'reference', receipt: null, token: null },
      pl_eqt: { status: 'known', v: 255, unit: 'K', type: 'reference', receipt: null, token: null },
      pl_insol: { status: 'known', v: 1.0, unit: 'S⊕', type: 'reference', receipt: null, token: null },
      sy_dist: { status: 'unknown', v: null, unit: 'pc', type: 'reference', receipt: null, token: null },
    },
  },
  jupiter: {
    id: 'jupiter',
    name: 'Jupiter (Solar System Reference)',
    hostname: 'Sun',
    status: 'reference',
    planetClass: 'gas_giant',
    massProvenanceLabel: 'reference',
    fields: {
      pl_rade: { status: 'known', v: 11.209, unit: 'R⊕', type: 'reference', receipt: null, token: null },
      pl_bmasse: { status: 'known', v: 317.83, unit: 'M⊕', type: 'reference', receipt: null, token: null },
      pl_dens: { status: 'known', v: 1.33, unit: 'g/cm³', type: 'reference', receipt: null, token: null },
      pl_orbper: { status: 'known', v: 4332.59, unit: 'days', type: 'reference', receipt: null, token: null },
      pl_orbsmax: { status: 'known', v: 5.204, unit: 'AU', type: 'reference', receipt: null, token: null },
      pl_eqt: { status: 'known', v: 110, unit: 'K', type: 'reference', receipt: null, token: null },
      pl_insol: { status: 'known', v: 0.037, unit: 'S⊕', type: 'reference', receipt: null, token: null },
      sy_dist: { status: 'unknown', v: null, unit: 'pc', type: 'reference', receipt: null, token: null },
    },
  },
});

export function formatFieldSummary(planetId, fieldName, fieldObj) {
  const unit = FIELD_UNITS[fieldName] ?? '';
  const receipt = makeReceiptId(planetId, fieldName);
  const token = formatToken(receipt);

  if (!fieldObj || fieldObj.v === null || fieldObj.v === undefined) {
    return {
      status: 'unknown',
      v: null,
      unit,
      type: fieldObj?.type ?? 'archive',
      lim: null,
      receipt: 'unknown',
      receiptId: receipt,
      token: null,
    };
  }

  return {
    status: 'known',
    v: fieldObj.v,
    unit,
    type: fieldObj.type,
    lim: fieldObj.lim ?? null,
    receipt,
    receiptId: receipt,
    token,
  };
}

function formatZodError(parsedError) {
  return parsedError.issues
    .map((iss) => `${iss.path.join('.') || 'args'}: ${iss.message}`)
    .join('; ');
}

/**
 * 1. search_planets(args, snapshot)
 */
export function search_planets(args = {}, snapshot) {
  const parsed = PlanetFiltersSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid search_planets arguments: ${formatZodError(parsed.error)}`,
      actions: [],
    };
  }

  const validArgs = parsed.data;
  const limit = validArgs.limit ?? 10;

  // Apply filters without limit first to know total matches, then slice to limit
  const allMatched = applyFilters(snapshot.planets, { ...validArgs, limit: undefined });
  const matched = allMatched.slice(0, limit);

  const rows = matched.map((p) => {
    const fields = {};
    for (const key of COMPACT_SEARCH_FIELDS) {
      fields[key] = formatFieldSummary(p.id, key, p.fields?.[key]);
    }

    let totalSolutions = 0;
    if (p.dispute?.fields) {
      for (const df of Object.values(p.dispute.fields)) {
        totalSolutions += df?.n ?? 0;
      }
    }

    return {
      id: p.id,
      name: p.name,
      systemId: p.systemId,
      hostname: p.hostname,
      status: p.status,
      discoveryYear: p.discovery?.year ?? null,
      discoveryMethod: p.discovery?.method ?? null,
      hzStatus: p.hab?.hzPosition?.status ?? 'unknown',
      planetClass: p.planetClass,
      massProvenanceLabel: p.massProvenanceLabel,
      disputed: p.dispute?.disputed ?? null,
      nSolutions: p.dispute?.fields?.pl_rade?.n ?? 0,
      totalSolutions,
      fields,
    };
  });

  const actions =
    matched.length > 0
      ? [{ type: 'highlight', ids: matched.map((p) => p.id), mode: 'set' }]
      : [];

  return {
    ok: true,
    totalMatched: allMatched.length,
    count: rows.length,
    rows,
    actions,
  };
}

/**
 * 2. get_planet(args, snapshot)
 */
export function get_planet(args, snapshot) {
  const parsed = GetPlanetToolArgsSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid get_planet arguments: ${formatZodError(parsed.error)}`,
      actions: [],
    };
  }

  const { planetId } = parsed.data;
  const canonicalId = resolveCanonicalPlanetId(planetId, snapshot.planetById);
  const planet = canonicalId ? snapshot.planetById.get(canonicalId) : null;
  if (!planet) {
    return {
      ok: false,
      error: `Planet "${planetId}" not found in snapshot ${snapshot.snapshotId}`,
      actions: [],
    };
  }

  const fields = {};
  for (const [key, fieldObj] of Object.entries(planet.fields)) {
    fields[key] = formatFieldSummary(planet.id, key, fieldObj);
  }

  return {
    ok: true,
    planet: {
      id: planet.id,
      name: planet.name,
      systemId: planet.systemId,
      hostname: planet.hostname,
      status: planet.status,
      discovery: planet.discovery,
      planetClass: planet.planetClass,
      massProvenance: planet.massProvenance,
      massProvenanceLabel: planet.massProvenanceLabel,
      completeness: planet.completeness,
      fields,
      hab: planet.hab,
      dispute: planet.dispute,
    },
    actions: [{ type: 'select', id: planet.id }],
  };
}

/**
 * 3. compare_planets(args, snapshot)
 */
export function compare_planets(args, snapshot) {
  const parsed = ComparePlanetsToolArgsSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid compare_planets arguments: ${formatZodError(parsed.error)}`,
      actions: [],
    };
  }

  const { planetIds } = parsed.data;
  const items = [];

  for (const rawId of planetIds) {
    const lower = rawId.toLowerCase();
    if (REFERENCE_BODIES[lower]) {
      items.push(REFERENCE_BODIES[lower]);
      continue;
    }
    const canonicalId = resolveCanonicalPlanetId(rawId, snapshot.planetById);
    const p = canonicalId ? snapshot.planetById.get(canonicalId) : null;
    if (!p) {
      return {
        ok: false,
        error: `Planet "${rawId}" not found in snapshot ${snapshot.snapshotId}`,
        actions: [],
      };
    }
    const fields = {};
    for (const key of Object.keys(REFERENCE_BODIES.earth.fields)) {
      fields[key] = formatFieldSummary(p.id, key, p.fields?.[key]);
    }
    items.push({
      id: p.id,
      name: p.name,
      systemId: p.systemId,
      hostname: p.hostname,
      status: p.status,
      planetClass: p.planetClass,
      massProvenanceLabel: p.massProvenanceLabel,
      hzStatus: p.hab?.hzPosition?.status ?? 'unknown',
      disputed: p.dispute?.disputed ?? null,
      fields,
    });
  }

  const normalizedIds = items.map((item) => item.id);

  return {
    ok: true,
    planets: items,
    actions: [{ type: 'open_compare', ids: normalizedIds }],
  };
}

/**
 * 4. focus_camera(args, snapshot)
 */
export function focus_camera(args, snapshot) {
  const parsed = FocusCameraToolArgsSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid focus_camera arguments: ${formatZodError(parsed.error)}`,
      actions: [],
    };
  }

  const { level, targetId } = parsed.data;

  if (level === 'galaxy') {
    return {
      ok: true,
      targetId: null,
      level: 'galaxy',
      actions: [{ type: 'focus', targetId: null, level: 'galaxy' }],
    };
  }

  if (level === 'planet') {
    const canonicalId = resolveCanonicalPlanetId(targetId, snapshot.planetById);
    const planet = canonicalId ? snapshot.planetById.get(canonicalId) : null;
    if (!planet) {
      return {
        ok: false,
        error: `Target planet "${targetId}" does not exist in snapshot`,
        actions: [],
      };
    }
    return {
      ok: true,
      targetId: planet.id,
      level: 'planet',
      actions: [{ type: 'focus', targetId: planet.id, level: 'planet' }],
    };
  }

  if (level === 'system') {
    const canonicalSys = resolveCanonicalSystemId(targetId, snapshot.hostById);
    const host = canonicalSys ? snapshot.hostById.get(canonicalSys) : null;
    if (!host) {
      return {
        ok: false,
        error: `Target system "${targetId}" does not exist in snapshot`,
        actions: [],
      };
    }
    return {
      ok: true,
      targetId: host.systemId,
      level: 'system',
      actions: [{ type: 'focus', targetId: host.systemId, level: 'system' }],
    };
  }

  return {
    ok: false,
    error: `Unsupported camera level "${level}"`,
    actions: [],
  };
}

/**
 * 5. highlight(args, snapshot)
 */
export function highlight(args, snapshot) {
  const parsed = HighlightToolArgsSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid highlight arguments: ${formatZodError(parsed.error)}`,
      actions: [],
    };
  }

  const { mode, planetIds } = parsed.data;
  if (mode === 'clear') {
    return {
      ok: true,
      ids: [],
      mode: 'clear',
      actions: [{ type: 'highlight', ids: [], mode: 'clear' }],
    };
  }

  const validIds = [];
  const unknownIds = [];
  for (const id of planetIds ?? []) {
    if (snapshot.planetById.has(id)) {
      validIds.push(id);
    } else {
      unknownIds.push(id);
    }
  }

  if (validIds.length === 0) {
    return {
      ok: false,
      error: `None of the requested planetIds exist in snapshot: ${unknownIds.join(', ')}`,
      actions: [],
    };
  }

  return {
    ok: true,
    ids: validIds,
    mode: 'set',
    actions: [{ type: 'highlight', ids: validIds, mode: 'set' }],
  };
}

/**
 * 6. open_timeline(args, snapshot)
 */
export function open_timeline(args, _snapshot) {
  const parsed = OpenTimelineToolArgsSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid open_timeline arguments: ${formatZodError(parsed.error)}`,
      actions: [],
    };
  }

  const { throughYear, playing } = parsed.data;
  const action = {
    type: 'timeline',
    year: throughYear,
    ...(playing !== undefined ? { playing } : {}),
  };

  return {
    ok: true,
    throughYear,
    playing: playing ?? false,
    actions: [action],
  };
}

const TOOL_HANDLERS = Object.freeze({
  search_planets,
  get_planet,
  compare_planets,
  focus_camera,
  highlight,
  open_timeline,
});

/**
 * Dispatches a named tool call against the snapshot.
 */
export function executeToolCall(toolName, rawArgs, snapshot) {
  if (!Object.prototype.hasOwnProperty.call(ToolArgumentSchemasByName, toolName)) {
    return {
      ok: false,
      error: `Unknown tool "${toolName}"`,
      actions: [],
    };
  }
  const handler = TOOL_HANDLERS[toolName];
  return handler(rawArgs, snapshot);
}
