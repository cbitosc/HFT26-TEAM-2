/**
 * server/helm/validate.js
 * Defence-in-depth output validator for HELM responses (ARCHITECTURE.md Section 8.5).
 *
 * Enforces:
 *   1. Stripping `<think>...</think>` blocks.
 *   2. Habitability Verdict Ban (no claiming a planet is/isn't habitable or supports life).
 *   3. Receipt token verification (`{{r:<planetId>.<fieldName>}}` must exist and be non-null in snapshot).
 *   4. Naked number ban (no un-receipted scientific measurements or bare numbers outside small counts <=20 and years 1992-2026).
 *   5. Action validation against `HelmActionSchema` and snapshot entity existence.
 */

import { HelmActionSchema, HelmSegmentSchema } from '../../shared/schemas.js';
import { parseSegments } from '../../shared/receipts.js';

const THINK_BLOCK_REGEX = /<think>[\s\S]*?(?:<\/think>|$)/gi;
const RECEIPT_TOKEN_REGEX = /\{\{r:([^}]+)\}\}/g;
const STRICT_RECEIPT_ID_REGEX = /^[a-z0-9-]+\.[a-z0-9_]+$/;

/**
 * Forbidden habitability verdict patterns (ARCHITECTURE.md Section 8.5).
 * Note: "habitable zone" and "potential habitability indicators" are explicitly allowed.
 */
const FORBIDDEN_VERDICT_PATTERNS = [
  /\bis\s+(?:potentially\s+|likely\s+|probably\s+|definitely\s+)?habitable\b/i,
  /\bare\s+(?:potentially\s+|likely\s+|probably\s+|definitely\s+)?habitable\b/i,
  /\buninhabitable\b/i,
  /\bnot\s+habitable\b/i,
  /\b(?:supports?|can\s+support|cannot\s+support|can't\s+support|could\s+support|able\s+to\s+support|unable\s+to\s+support)\s+life\b/i,
  /\b(?:is\s+|are\s+)?suitable\s+for\s+life\b/i,
  /\bunsuitable\s+for\s+life\b/i,
  /\b(?:livable|liveable|unlivable|unliveable)\b/i,
  /\bearth-like\s+(?:world|planet)s?\b/i,
  /\bconfirmed\s+candidates?\b/i,
  /\bhabitable\s+(?:world|planet|exoplanet)s?\b/i,
];

/**
 * Scientific unit patterns that must NEVER appear next to a bare number in prose.
 */
const NAKED_MEASUREMENT_WITH_UNIT_REGEX =
  /(?:^|[^\w.-])([+-]?\d+(?:\.\d+)?)\s*(?:R⊕|M⊕|S⊕|R☉|M☉|L☉|R_earth|M_earth|Earth\s+radii|Earth\s+masses|g\/cm³|g\/cm\^3|parsecs?\b|pc\b|light[-\s]?years?\b|ly\b|kelvins?\b|K\b|AU\b|days?\b)/gi;

/**
 * Common astronomical catalog prefixes whose designation numbers are names, not measurements.
 */
const CATALOG_DESIGNATION_REGEX =
  /\b(?:TRAPPIST|Kepler|K2|TOI|KOI|GJ|Gliese|HD|HIP|LHS|LP|LTT|Wolf|Ross|WASP|HAT-P|HATS|CoRoT|XO|TrES|KELT|Qatar|NGTS|MASCARA|OGLE|MOA|KMT|TIC|Gaia|PSR|WD|BD|CD|CPD|TYC|2MASS|WISE|SPECULOOS|Teegarden's)\s*[-+]?\s*\d+(?:[.-]\d+)*(?:\s*[a-zA-Z])?\b/gi;

const PLANET_ID_ALIASES = Object.freeze({
  'proxima-centauri-b': 'proxima-cen-b',
  'proxima-centauri-d': 'proxima-cen-d',
});

const SYSTEM_ID_ALIASES = Object.freeze({
  'proxima-centauri': 'proxima-cen',
});

function getPlanetMap(snapshotOrMap) {
  if (!snapshotOrMap) return null;
  if (snapshotOrMap instanceof Map) return snapshotOrMap;
  if (snapshotOrMap.planetById instanceof Map) return snapshotOrMap.planetById;
  return null;
}

export function resolveCanonicalPlanetId(planetId, planetById) {
  if (!planetId || typeof planetId !== 'string') return null;
  if (!planetById) return planetId;
  if (planetById.has(planetId)) return planetId;
  const alias = PLANET_ID_ALIASES[planetId.toLowerCase()];
  if (alias && planetById.has(alias)) return alias;
  return null;
}

export function resolveCanonicalSystemId(systemId, hostById) {
  if (!systemId || typeof systemId !== 'string') return null;
  if (!hostById) return systemId;
  if (hostById.has(systemId)) return systemId;
  const alias = SYSTEM_ID_ALIASES[systemId.toLowerCase()];
  if (alias && hostById.has(alias)) return alias;
  return null;
}

/**
 * 1. Strips `<think>...</think>` blocks from model text.
 */
export function stripThinkBlocks(text) {
  if (typeof text !== 'string') return '';
  return text.replace(THINK_BLOCK_REGEX, '').trim();
}

/**
 * 2. Checks text for forbidden habitability verdicts or candidate misrepresentations.
 */
export function checkForbiddenVerdicts(text) {
  const cleaned = stripThinkBlocks(text);
  const violations = [];
  for (const pattern of FORBIDDEN_VERDICT_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match) {
      violations.push(match[0]);
    }
  }
  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * 3. Resolves a receipt ID (`<planetId>.<fieldName>`) against the snapshot.
 * Returns `{ receiptId, planetId, fieldName, planet, field }` when the planet and field
 * exist and `field.v !== null`, or `null` otherwise.
 */
export function resolveReceipt(receiptId, snapshotOrPlanetById) {
  if (typeof receiptId !== 'string' || !STRICT_RECEIPT_ID_REGEX.test(receiptId)) {
    return null;
  }
  const dotIdx = receiptId.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === receiptId.length - 1) {
    return null;
  }
  const rawPlanetId = receiptId.slice(0, dotIdx);
  const fieldName = receiptId.slice(dotIdx + 1);

  const planetById = getPlanetMap(snapshotOrPlanetById);
  if (!planetById) return null;

  const planetId = resolveCanonicalPlanetId(rawPlanetId, planetById);
  if (!planetId) return null;

  const planet = planetById.get(planetId);
  if (!planet || !planet.fields) return null;

  const field = planet.fields[fieldName];
  if (!field || field.v === null || field.v === undefined || !Number.isFinite(field.v)) {
    return null;
  }

  return {
    receiptId: `${planetId}.${fieldName}`,
    planetId,
    fieldName,
    planet,
    field,
  };
}

/**
 * 4. Validates all `{{r:<planetId>.<fieldName>}}` tokens in `text`.
 * Any unknown or null-valued receipt token is recorded in `invalidTokens` and stripped from `sanitizedText`.
 */
export function validateReceiptTokens(text, snapshotOrPlanetById) {
  const cleaned = stripThinkBlocks(text);
  const validTokens = [];
  const invalidTokens = [];

  const sanitizedText = cleaned.replace(RECEIPT_TOKEN_REGEX, (fullMatch, rawId) => {
    const id = String(rawId || '').trim();
    const resolved = resolveReceipt(id, snapshotOrPlanetById);
    if (resolved) {
      validTokens.push(resolved.receiptId);
      return `{{r:${resolved.receiptId}}}`;
    }
    invalidTokens.push(id);
    return 'unknown';
  });

  return {
    valid: invalidTokens.length === 0,
    validTokens,
    invalidTokens,
    sanitizedText,
  };
}

/**
 * 5. Checks for naked scientific numbers outside of `{{r:...}}` tokens.
 * Allowed bare numbers:
 *   - integers 0..20 (small list counts) WITHOUT scientific units
 *   - integers 1992..2026 (discovery/archive years) WITHOUT scientific units
 *   - catalog designation numbers inside known planet/star names
 */
export function checkNakedNumbers(text, snapshot = null) {
  let working = stripThinkBlocks(text);

  // Remove all receipt tokens first so numbers insidereceipt IDs (e.g. trappist-1-e.pl_rade) are ignored
  working = working.replace(RECEIPT_TOKEN_REGEX, ' ');

  // Remove exact planet names and hostnames from the snapshot if provided
  if (snapshot && Array.isArray(snapshot.planets)) {
    // Only strip names that contain digits to keep this fast
    for (const p of snapshot.planets) {
      if (/\d/.test(p.name) && working.includes(p.name)) {
        working = working.split(p.name).join(' ');
      }
      if (/\d/.test(p.hostname) && working.includes(p.hostname)) {
        working = working.split(p.hostname).join(' ');
      }
      if (/\d/.test(p.id) && working.includes(p.id)) {
        working = working.split(p.id).join(' ');
      }
    }
  }

  // Also strip standard catalog designations (e.g. TRAPPIST-1, Kepler-186, TOI-700)
  working = working.replace(CATALOG_DESIGNATION_REGEX, ' ');

  const nakedNumbers = [];

  // 5a. Check any number followed by a scientific unit (even if integer <= 20)
  for (const match of working.matchAll(NAKED_MEASUREMENT_WITH_UNIT_REGEX)) {
    nakedNumbers.push(match[0].trim());
  }

  // Strip unit matches so we don't double-report them below
  const withoutUnitMatches = working.replace(NAKED_MEASUREMENT_WITH_UNIT_REGEX, ' ');

  // 5b. Scan remaining standalone numbers
  const numberRegex = /(?:^|[^\w.])([+-]?\d+(?:\.\d+)?)(?=$|[^\w.])/g;
  for (const match of withoutUnitMatches.matchAll(numberRegex)) {
    const rawNum = match[1];
    // Any decimal number (e.g. 9.99, 1.30, 0.8) in prose is a naked measurement
    if (rawNum.includes('.')) {
      nakedNumbers.push(rawNum);
      continue;
    }
    const n = Number(rawNum);
    if (!Number.isInteger(n)) {
      nakedNumbers.push(rawNum);
      continue;
    }
    const isSmallCount = n >= 0 && n <= 20;
    const isArchiveYear = n >= 1992 && n <= 2026;
    if (!isSmallCount && !isArchiveYear) {
      nakedNumbers.push(rawNum);
    }
  }

  return {
    valid: nakedNumbers.length === 0,
    nakedNumbers,
  };
}

/**
 * 6. Validates UI actions against `HelmActionSchema` and verifies that referenced
 * planetIds / systemIds exist in `snapshot`.
 */
export function validateActions(actions, snapshot) {
  if (!Array.isArray(actions)) {
    return { valid: false, validActions: [], rejectedActions: [] };
  }

  const validActions = [];
  const rejectedActions = [];
  const planetById = snapshot?.planetById;
  const hostById = snapshot?.hostById;

  for (const action of actions) {
    const parsed = HelmActionSchema.safeParse(action);
    if (!parsed.success) {
      rejectedActions.push({ action, reason: 'schema_invalid' });
      continue;
    }

    const a = parsed.data;

    if (a.type === 'focus') {
      if (a.level === 'galaxy') {
        validActions.push({ type: 'focus', targetId: null, level: 'galaxy' });
      } else if (a.level === 'planet') {
        const canonicalId = resolveCanonicalPlanetId(a.targetId, planetById);
        if (canonicalId) {
          validActions.push({ ...a, targetId: canonicalId });
        } else {
          rejectedActions.push({ action: a, reason: 'unknown_planet' });
        }
      } else if (a.level === 'system') {
        const canonicalSys = resolveCanonicalSystemId(a.targetId, hostById);
        if (canonicalSys) {
          validActions.push({ ...a, targetId: canonicalSys });
        } else {
          rejectedActions.push({ action: a, reason: 'unknown_system' });
        }
      }
      continue;
    }

    if (a.type === 'highlight') {
      if (a.mode === 'clear') {
        validActions.push({ type: 'highlight', ids: [], mode: 'clear' });
      } else {
        const filteredIds = planetById
          ? a.ids.map((id) => resolveCanonicalPlanetId(id, planetById)).filter(Boolean)
          : a.ids;
        if (filteredIds.length > 0) {
          validActions.push({ type: 'highlight', ids: filteredIds, mode: 'set' });
        } else {
          rejectedActions.push({ action: a, reason: 'no_valid_highlight_ids' });
        }
      }
      continue;
    }

    if (a.type === 'open_compare') {
      const validCompareIds = a.ids
        .map((id) => {
          const lower = id.toLowerCase();
          if (lower === 'earth' || lower === 'jupiter') return lower;
          return resolveCanonicalPlanetId(id, planetById);
        })
        .filter(Boolean);
      if (validCompareIds.length >= 2 && validCompareIds.length <= 3) {
        validActions.push({ type: 'open_compare', ids: validCompareIds });
      } else {
        rejectedActions.push({ action: a, reason: 'invalid_compare_ids' });
      }
      continue;
    }

    if (a.type === 'select') {
      if (a.id === null) {
        validActions.push(a);
      } else {
        const canonicalId = resolveCanonicalPlanetId(a.id, planetById);
        if (canonicalId) {
          validActions.push({ ...a, id: canonicalId });
        } else {
          rejectedActions.push({ action: a, reason: 'unknown_select_planet' });
        }
      }
      continue;
    }

    if (a.type === 'timeline') {
      validActions.push(a);
    }
  }

  return {
    valid: rejectedActions.length === 0,
    validActions,
    rejectedActions,
  };
}

/**
 * Full pipeline validator for HELM prose + actions.
 */
export function validateHelmOutput({ text = '', actions = [] }, snapshot) {
  const strippedText = stripThinkBlocks(text);
  const verdictCheck = checkForbiddenVerdicts(strippedText);
  const receiptCheck = validateReceiptTokens(strippedText, snapshot);
  const numberCheck = checkNakedNumbers(receiptCheck.sanitizedText, snapshot);
  const actionCheck = validateActions(actions, snapshot);

  const rawSegments = parseSegments(receiptCheck.sanitizedText);
  const segments = rawSegments.filter((seg) => HelmSegmentSchema.safeParse(seg).success);

  const errors = [];
  if (!verdictCheck.valid) {
    errors.push(`Forbidden habitability verdict: ${verdictCheck.violations.join(', ')}`);
  }
  if (!receiptCheck.valid) {
    errors.push(`Unknown or null receipt tokens: ${receiptCheck.invalidTokens.join(', ')}`);
  }
  if (!numberCheck.valid) {
    errors.push(`Un-receipted naked numbers: ${numberCheck.nakedNumbers.join(', ')}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    strippedText,
    sanitizedText: receiptCheck.sanitizedText,
    segments,
    validActions: actionCheck.validActions,
    rejectedActions: actionCheck.rejectedActions,
    verdictCheck,
    receiptCheck,
    numberCheck,
  };
}
