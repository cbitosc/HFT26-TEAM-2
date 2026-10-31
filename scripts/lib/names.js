/**
 * scripts/lib/names.js
 * Deterministic slug generation and collision handling for planetId and systemId.
 *
 * Rules (ARCHITECTURE.md Section 6.6):
 *   - `planetId` = slug of `pl_name` (lowercase, non-alphanumerics -> `-`), collisions get `-2`, `-3`.
 *   - `systemId` = slug of `hostname` (same hostname shares the same systemId; distinct hostnames colliding get `-2`, `-3`).
 */

/**
 * Converts a raw name into a lowercase alphanumeric hyphenated slug.
 * @param {string} rawName
 * @returns {string}
 */
export function slugifyName(rawName) {
  if (typeof rawName !== 'string' || !rawName.trim()) {
    throw new Error(`Cannot slugify empty name: ${JSON.stringify(rawName)}`);
  }
  const slug = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'item';
}

/**
 * Creates a deterministic slug allocator that maps raw names to unique slugs.
 * - If `reuseForSameRawName` is true (used for `hostname` -> `systemId`), identical raw names
 *   receive the exact same slug, while a different raw name that produces the same base slug
 *   gets `-2`, `-3`, etc.
 * - If `reuseForSameRawName` is false (used for `pl_name` -> `planetId`), every invocation
 *   returns a distinct slug (`-2`, `-3` on collision) and records any duplicate raw names.
 */
export function createSlugAllocator({ reuseForSameRawName = false } = {}) {
  const rawToSlug = new Map();
  const usedSlugs = new Set();
  const baseCounts = new Map();
  const collisions = [];

  return {
    allocate(rawName) {
      const key = String(rawName).trim();
      if (reuseForSameRawName && rawToSlug.has(key)) {
        return rawToSlug.get(key);
      }

      const base = slugifyName(key);
      let candidate = base;
      if (usedSlugs.has(candidate)) {
        let nextNum = (baseCounts.get(base) || 1) + 1;
        while (usedSlugs.has(`${base}-${nextNum}`)) {
          nextNum += 1;
        }
        candidate = `${base}-${nextNum}`;
        baseCounts.set(base, nextNum);
        collisions.push({ rawName: key, base, assignedSlug: candidate });
      } else {
        baseCounts.set(base, 1);
      }

      usedSlugs.add(candidate);
      if (reuseForSameRawName) {
        rawToSlug.set(key, candidate);
      }
      return candidate;
    },
    getCollisions() {
      return [...collisions];
    },
  };
}

/**
 * Normalizes a planet or star designation for fuzzy cross-catalog matching
 * by lowercasing and stripping non-alphanumeric characters.
 *
 * Examples:
 *   "TRAPPIST-1 e" -> "trappist1e"
 *   "HD 142022 A b" -> "hd142022ab"
 *   "TOI-1098 Ab"  -> "toi1098ab"
 *
 * @param {string} rawName
 * @returns {string}
 */
export function normalizePlanetName(rawName) {
  if (typeof rawName !== 'string') return '';
  return rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Builds an Exo-MerCat name reconciliation bridge lookup structure.
 *
 * Resolution order (ARCHITECTURE.md Section 6.7):
 *   1. Exact NASA name match
 *   2. Normalized NASA name match
 *   3. Secondary aliases (exomercat_name, toi_name, epic_name)
 *   4. Unmatched -> null
 *
 * @param {Array<object>} rows - Array of Exo-MerCat records
 * @returns {{
 *   lookup: (nasaName: string) => ({
 *     euName: string,
 *     nasaName: string,
 *     status: string|null,
 *     originalStatusString: string|null,
 *     checkedStatusString: string|null,
 *     matchedBy: 'exact' | 'normalized' | 'alias'
 *   } | null),
 *   exactCount: number,
 *   totalRows: number
 * }}
 */
export function buildNameBridge(rows = []) {
  const exactNasaMap = new Map();
  const normNasaMap = new Map();
  const aliasMap = new Map();

  for (const r of rows) {
    if (!r) continue;
    const nasaName = typeof r.nasa_name === 'string' ? r.nasa_name.trim() : '';
    const euName = typeof r.eu_name === 'string' ? r.eu_name.trim() : '';
    const exoName = typeof r.exomercat_name === 'string' ? r.exomercat_name.trim() : '';
    const toiName = typeof r.toi_name === 'string' ? r.toi_name.trim() : '';
    const epicName = typeof r.epic_name === 'string' ? r.epic_name.trim() : '';

    if (!euName && !nasaName) continue;

    const entry = {
      euName: euName || nasaName,
      nasaName: nasaName || null,
      status: r.status || null,
      originalStatusString: r.original_status_string || null,
      checkedStatusString: r.checked_status_string || null,
    };

    if (nasaName) {
      if (!exactNasaMap.has(nasaName)) {
        exactNasaMap.set(nasaName, entry);
      }
      const normNasa = normalizePlanetName(nasaName);
      if (normNasa && !normNasaMap.has(normNasa)) {
        normNasaMap.set(normNasa, entry);
      }
    }

    for (const alias of [exoName, toiName, epicName]) {
      if (alias) {
        const normAlias = normalizePlanetName(alias);
        if (normAlias && !aliasMap.has(normAlias)) {
          aliasMap.set(normAlias, entry);
        }
      }
    }
  }

  return {
    exactCount: exactNasaMap.size,
    totalRows: rows.length,
    lookup(nasaName) {
      if (!nasaName || typeof nasaName !== 'string') return null;
      const trimmed = nasaName.trim();
      if (!trimmed) return null;

      // 1. Exact NASA name match
      if (exactNasaMap.has(trimmed)) {
        const found = exactNasaMap.get(trimmed);
        return { ...found, matchedBy: 'exact' };
      }

      // 2. Normalized NASA name match
      const norm = normalizePlanetName(trimmed);
      if (normNasaMap.has(norm)) {
        const found = normNasaMap.get(norm);
        return { ...found, matchedBy: 'normalized' };
      }

      // 3. Normalized alias match
      if (aliasMap.has(norm)) {
        const found = aliasMap.get(norm);
        return { ...found, matchedBy: 'alias' };
      }

      return null;
    },
  };
}

