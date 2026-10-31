/**
 * src/components/ReceiptChip.jsx
 * Renders a single Field measurement with its uncertainty, limit flag, provenance badge,
 * source attribution, and an interactive receipt popover.
 *
 * Security & Honesty Rules:
 *   - Missing values (field.v === null || field.v === undefined) render <UnknownValue />.
 *   - Exact 0 (field.v === 0) is preserved and rendered as "0".
 *   - Never renders field.ref.raw via dangerouslySetInnerHTML; raw reference strings are rendered
 *     strictly as escaped plain text inside <code>.
 *   - External links are rendered only if href starts with https:// or http://.
 */

import { useState } from 'react';
import { makeReceiptId } from '../../shared/receipts.js';
import { FIELD_DICTIONARY, PROVENANCE_TYPE_META, formatNumericValue } from '../data/fieldDictionary.js';
import { UnknownValue } from './UnknownValue.jsx';

function isSafeHttpUrl(href) {
  if (typeof href !== 'string') return false;
  const trimmed = href.trim();
  return trimmed.startsWith('https://') || trimmed.startsWith('http://');
}

function formatUncertainty(e1, e2) {
  const hasE1 = e1 !== null && e1 !== undefined && Number.isFinite(e1);
  const hasE2 = e2 !== null && e2 !== undefined && Number.isFinite(e2);
  if (!hasE1 && !hasE2) return null;

  if (hasE1 && hasE2 && Math.abs(Math.abs(e1) - Math.abs(e2)) < 1e-9) {
    return `±${formatNumericValue(Math.abs(e1))}`;
  }
  const up = hasE1 ? `+${formatNumericValue(Math.abs(e1))}` : '+?';
  const down = hasE2 ? `-${formatNumericValue(Math.abs(e2))}` : '-?';
  return `${up} / ${down}`;
}

export function ReceiptChip({
  planetId,
  fieldKey,
  field,
  unit,
  snapshotId,
  highlight = false,
}) {
  const [open, setOpen] = useState(false);

  if (!field || field.v === null || field.v === undefined) {
    return <UnknownValue />;
  }

  const dictEntry = FIELD_DICTIONARY[fieldKey] || null;
  const resolvedUnit = unit !== undefined ? unit : (dictEntry?.unit ?? '');
  const receiptId = planetId && fieldKey ? makeReceiptId(planetId, fieldKey) : `${fieldKey}`;
  const provMeta = PROVENANCE_TYPE_META[field.type] || PROVENANCE_TYPE_META.archive;

  const formattedVal = formatNumericValue(field.v);
  const uncertaintyStr = formatUncertainty(field.e1, field.e2);

  let limitPrefix = null;
  let limitDescription = null;
  if (field.lim === 1) {
    limitPrefix = '≤ ';
    limitDescription = 'Upper limit (lim = 1)';
  } else if (field.lim === -1) {
    limitPrefix = '≥ ';
    limitDescription = 'Lower limit (lim = -1)';
  }

  const shortSource =
    field.ref?.text ||
    (field.type === 'calculated' ? 'Published formula' : null) ||
    (field.type === 'derived' ? 'Explorer heuristic' : null) ||
    'Archive';

  const safeHref = isSafeHttpUrl(field.ref?.href) ? field.ref.href.trim() : null;

  return (
    <div className={`receipt-chip-wrapper ${highlight ? 'receipt-chip-highlight' : ''}`}>
      <button
        type="button"
        className={`receipt-chip ${open ? 'receipt-chip-open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        title={`Click to inspect provenance receipt ${receiptId}`}
      >
        <span className="receipt-value-group">
          {limitPrefix && (
            <span className="receipt-limit-flag" title={limitDescription}>
              {limitPrefix}
            </span>
          )}
          <span className="receipt-number">{formattedVal}</span>
          {uncertaintyStr && <span className="receipt-uncertainty">{uncertaintyStr}</span>}
          {resolvedUnit && <span className="receipt-unit">{resolvedUnit}</span>}
        </span>

        <span className="receipt-meta-group">
          <span
            className={`receipt-prov-badge prov-${field.type}`}
            title={provMeta.title}
          >
            {provMeta.badge}
          </span>
          <span className="receipt-source-short">{shortSource}</span>
        </span>
      </button>

      {open && (
        <div className="receipt-popover" role="region" aria-label={`Provenance receipt for ${receiptId}`}>
          <div className="receipt-popover-header">
            <code className="receipt-id-code">{receiptId}</code>
            <button
              type="button"
              className="receipt-popover-close"
              onClick={() => setOpen(false)}
              aria-label="Close receipt popover"
            >
              ×
            </button>
          </div>

          <dl className="receipt-popover-list">
            <div className="receipt-popover-row">
              <dt>Snapshot ID</dt>
              <dd><code>{snapshotId || 'unknown'}</code></dd>
            </div>

            <div className="receipt-popover-row">
              <dt>Provenance</dt>
              <dd>
                <span className={`receipt-prov-badge prov-${field.type}`}>
                  {provMeta.badge}
                </span>{' '}
                <strong>{field.type}</strong> — {provMeta.title}
                <div className="receipt-prov-desc">{provMeta.description}</div>
              </dd>
            </div>

            {limitDescription && (
              <div className="receipt-popover-row">
                <dt>Limit Flag</dt>
                <dd className="receipt-limit-warning">{limitDescription}</dd>
              </div>
            )}

            {field.formula && (
              <div className="receipt-popover-row">
                <dt>Formula</dt>
                <dd><code>{field.formula}</code></dd>
              </div>
            )}

            {field.type === 'archive_calculated' && (
              <div className="receipt-popover-row">
                <dt>Inputs</dt>
                <dd className="receipt-muted-note">
                  NASA internal inputs not specified (composite archive calculation)
                </dd>
              </div>
            )}

            {Array.isArray(field.inputs) && field.inputs.length > 0 && (
              <div className="receipt-popover-row">
                <dt>Input Receipts</dt>
                <dd className="receipt-input-list">
                  {field.inputs.map((inId) => (
                    <code key={inId} className="receipt-input-pill">
                      {inId}
                    </code>
                  ))}
                </dd>
              </div>
            )}

            {field.ref && (
              <div className="receipt-popover-row">
                <dt>Source Reference</dt>
                <dd>
                  {safeHref ? (
                    <a
                      href={safeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="receipt-ext-link"
                    >
                      {field.ref.text || safeHref} ↗
                    </a>
                  ) : (
                    <span>{field.ref.text || 'Unspecified reference'}</span>
                  )}
                  {field.ref.raw && (
                    <details className="receipt-raw-details">
                      <summary>Raw archive ref string (escaped)</summary>
                      <code className="receipt-raw-code">{field.ref.raw}</code>
                    </details>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

export default ReceiptChip;
