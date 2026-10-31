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

