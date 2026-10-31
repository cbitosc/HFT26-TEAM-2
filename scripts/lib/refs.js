/**
 * scripts/lib/refs.js
 * Tolerant parser for NASA Exoplanet Archive reference strings (`*_reflink`, `disc_refname`).
 *
 * Rules (ARCHITECTURE.md Section 6.6, DEC-005 Option A):
 *   - Archive reference columns may be HTML anchors such as:
 *       `<a refstr=AGOL_ET_AL__2021 href=https://ui.adsabs.harvard.edu/abs/2021PSJ.....2....1A/abstract target=ref>Agol et al. 2021</a>`
 *     or NASA composite calculated markers:
 *       `<a refstr=CALCULATED_VALUE href=/docs/pscp_calc.html target=_blank>Calculated Value</a>`
 *   - Parse `href` and visible label with a tolerant regex; always keep the raw string (`raw`).
 *   - Resolve relative `/docs/pscp_calc.html` to `https://exoplanetarchive.ipac.caltech.edu/docs/pscp_calc.html`.
 *   - Detect `isArchiveCalculated: true` when `refstr=CALCULATED_VALUE` or `href` points to `/docs/pscp_calc.html`
 *     or visible label is `"Calculated Value"`.
 */

const NASA_ARCHIVE_ORIGIN = 'https://exoplanetarchive.ipac.caltech.edu';

const ANCHOR_TEXT_RE = /<a\b[^>]*>([\s\S]*?)<\/a>/i;
const HREF_ATTR_RE = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>"']+))/i;
const REFSTR_ATTR_RE = /\brefstr\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>"']+))/i;

/**
 * Parses a raw reference cell from NASA CSV into `{ ref, isArchiveCalculated }`.
 *
 * @param {string|null|undefined} rawCell
 * @returns {{ ref: { text: string, href: string|null, raw: string } | null, isArchiveCalculated: boolean }}
 */
export function parseArchiveRef(rawCell) {
  if (typeof rawCell !== 'string') {
    return { ref: null, isArchiveCalculated: false };
  }
  const raw = rawCell.trim();
  if (!raw) {
    return { ref: null, isArchiveCalculated: false };
  }

  const textMatch = raw.match(ANCHOR_TEXT_RE);
  const hrefMatch = raw.match(HREF_ATTR_RE);
  const refstrMatch = raw.match(REFSTR_ATTR_RE);

  const visibleText = textMatch
    ? textMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    : raw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  const rawHref = hrefMatch ? (hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || '').trim() : '';
  const refstr = refstrMatch ? (refstrMatch[1] || refstrMatch[2] || refstrMatch[3] || '').trim() : '';

  let href = null;
  if (rawHref) {
    if (rawHref.startsWith('https://') || rawHref.startsWith('http://')) {
      href = rawHref;
    } else if (rawHref.startsWith('/')) {
      href = `${NASA_ARCHIVE_ORIGIN}${rawHref}`;
    }
  }

  const isArchiveCalculated =
    refstr.toUpperCase() === 'CALCULATED_VALUE' ||
    rawHref.includes('/docs/pscp_calc.html') ||
    visibleText.toLowerCase() === 'calculated value';

  return {
    ref: {
      text: visibleText || raw,
      href,
      raw,
    },
    isArchiveCalculated,
  };
}

