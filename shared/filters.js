/**
 * shared/filters.js
 * Deterministic planet filtering and sorting shared identically by the browser
 * FiltersPanel and the server `search_planets` tool (ARCHITECTURE.md Section 9).
 *
 * Single-writer shared module owned by Reviewer / Integrator (AGENTS.md Section 2).
 */

function matchesRange(val, range) {
  if (!range || (range.min === undefined && range.max === undefined)) {
    return true;
  }
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return false;
  }
  if (range.min !== undefined && val < range.min) {
    return false;
  }
  if (range.max !== undefined && val > range.max) {
    return false;
  }
  return true;
}

function getSortValue(planet, sortBy) {
  switch (sortBy) {
    case 'distance':
      return planet.fields?.sy_dist?.v ?? null;
    case 'radius':
      return planet.fields?.pl_rade?.v ?? null;
    case 'mass':
      return planet.fields?.pl_bmasse?.v ?? null;
    case 'eqTemp':
      return planet.fields?.pl_eqt?.v ?? null;
    case 'discYear':
      return planet.discovery?.year ?? null;
    case 'nSolutions': {
      const fields = planet.dispute?.fields;
      if (!fields) return 0;
      let total = 0;
      for (const f of Object.values(fields)) {
        total += f?.n ?? 0;
      }
      return total;
    }
    default:
      return null;
  }
}

/**
 * Filters and sorts an array of PlanetRecord objects.
 * Missing values (`null`) never match numeric bounds and always sort last.
 *
 * @param {Array<object>} planets
 * @param {object} [filters={}]
 * @returns {Array<object>}
 */
export function applyFilters(planets, filters = {}) {
  if (!Array.isArray(planets)) return [];
  const f = filters || {};

  const query = typeof f.nameQuery === 'string' ? f.nameQuery.trim().toLowerCase() : '';
  const methodQuery = typeof f.method === 'string' ? f.method.trim().toLowerCase() : '';
  const requiredFields = Array.isArray(f.hasFields) ? f.hasFields : [];

  const filtered = planets.filter((p) => {
    if (query) {
      const nameMatch = p.name?.toLowerCase().includes(query);
      const hostMatch = p.hostname?.toLowerCase().includes(query);
      const idMatch = p.id?.toLowerCase().includes(query);
      if (!nameMatch && !hostMatch && !idMatch) return false;
    }

    if (methodQuery) {
      const m = p.discovery?.method?.toLowerCase() ?? '';
      if (m !== methodQuery) return false;
    }

    if (!matchesRange(p.fields?.pl_rade?.v ?? null, f.radiusEarth)) return false;
    if (!matchesRange(p.fields?.pl_bmasse?.v ?? null, f.massEarth)) return false;
    if (!matchesRange(p.fields?.pl_eqt?.v ?? null, f.eqTempK)) return false;
    if (!matchesRange(p.fields?.pl_orbper?.v ?? null, f.periodDays)) return false;
    if (!matchesRange(p.fields?.sy_dist?.v ?? null, f.distancePc)) return false;
    if (!matchesRange(p.discovery?.year ?? null, f.discYear)) return false;

    if (f.hz === 'in_conservative') {
      if (p.hab?.hzPosition?.status !== 'in_conservative') return false;
    } else if (f.hz === 'in_optimistic') {
      const s = p.hab?.hzPosition?.status;
      if (s !== 'in_conservative' && s !== 'in_optimistic_only') return false;
    }

    if (f.contestedOnly === true) {
      if (p.dispute?.disputed !== true) return false;
    }

    for (const fieldKey of requiredFields) {
      const fieldObj = p.fields?.[fieldKey];
      if (!fieldObj || fieldObj.v === null || fieldObj.v === undefined) {
        return false;
      }
    }

    return true;
  });

  if (f.sortBy) {
    const dir = f.sortDir === 'desc' ? -1 : 1;
    filtered.sort((a, b) => {
      const va = getSortValue(a, f.sortBy);
      const vb = getSortValue(b, f.sortBy);
      const aNull = va === null || va === undefined || !Number.isFinite(va);
      const bNull = vb === null || vb === undefined || !Number.isFinite(vb);
      if (aNull && bNull) return a.name.localeCompare(b.name);
      if (aNull) return 1; // nulls always last
      if (bNull) return -1;
      if (va !== vb) return (va - vb) * dir;
      return a.name.localeCompare(b.name);
    });
  }

  if (typeof f.limit === 'number' && Number.isFinite(f.limit) && f.limit > 0) {
    return filtered.slice(0, f.limit);
  }

  return filtered;
}

