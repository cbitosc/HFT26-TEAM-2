/**
 * src/panels/ComparePanel.jsx
 * VERSUS Side-by-side comparative matrix table:
 *   - Compares 2–3 bodies side by side (snapshot exoplanets + Earth / Jupiter reference baselines)
 *   - Displays core physical measurements, provenance receipts, uncertainties, and limit flags
 *   - Displays DISPUTE multi-solution consensus status
 *   - Displays the 5 HAB-LAB indicators with confidence levels
 *   - Preserves unknown states as grey UnknownValue; never invents science
 */

import { useExplorerStore } from '../store/explorerStore.js';
import { resolveComparableBody } from '../data/referenceBodies.js';
import { FIELD_DICTIONARY, PLANET_CLASS_META } from '../data/fieldDictionary.js';
import { ReceiptChip } from '../components/ReceiptChip.jsx';
import { UnknownValue } from '../components/UnknownValue.jsx';
import { DetectionBiasCaveat } from '../components/DetectionBiasCaveat.jsx';

export const COMPARE_FIELD_KEYS = [
  'pl_rade',
  'pl_bmasse',
  'pl_dens',
  'pl_orbper',
  'pl_orbsmax',
  'pl_eqt',
  'pl_insol',
  'st_teff',
  'sy_dist',
];

export const COMPARE_HAB_KEYS = [
  { key: 'hzPosition', label: '1. Habitable Zone Position' },
  { key: 'sizePlausibility', label: '2. Size Plausibility' },
  { key: 'massPlausibility', label: '3. Mass & Provenance' },
  { key: 'stellarType', label: '4. Host Star Context' },
  { key: 'dataCompleteness', label: '5. Data Completeness' },
];

export function ComparePanel() {
  const storeSnapshot = useExplorerStore((s) => s.snapshot);
  const storeCompareIds = useExplorerStore((s) => s.compareIds);
  const removeCompareId = useExplorerStore((s) => s.removeCompareId);
  const selectPlanet = useExplorerStore((s) => s.selectPlanet);

  const liveState = typeof window === 'undefined' ? useExplorerStore.getState() : null;
  const snapshot = liveState ? liveState.snapshot : storeSnapshot;
  const compareIds = liveState ? liveState.compareIds : storeCompareIds;

  const bodies = compareIds
    .map((id) => resolveComparableBody(id, snapshot))
    .filter(Boolean);

  const snapshotId = snapshot?.snapshotId || 'unknown';

  if (bodies.length === 0) {
    return (
      <div className="compare-empty-state" style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>
        <p>No planets selected for comparison. Add up to 3 planets from the scene or use the presets above.</p>
      </div>
    );
  }

  if (bodies.length < 2) {
    return (
      <div className="compare-empty-state" style={{ padding: '14px 16px', textAlign: 'center', color: '#94a3b8' }}>
        <p style={{ margin: 0 }}>
          <strong>1 of 2 minimum bodies selected ({bodies[0].name}).</strong>
          <span style={{ display: 'block', fontSize: '11.5px', marginTop: '4px', color: '#cbd5e1' }}>
            Please select at least one more planet (or click &ldquo;+ Earth&rdquo; above) to compare 2–3 bodies side by side.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="compare-drawer-body" role="region" aria-label="Comparative parameters table">
      <DetectionBiasCaveat />

      <div
        className="compare-grid"
        style={{
          gridTemplateColumns: `185px repeat(${bodies.length}, minmax(210px, 1fr))`,
        }}
      >
        {/* Header Row */}
        <div className="compare-cell compare-row-label compare-corner-cell">
          Parameter / Indicator
        </div>
        {bodies.map((b) => {
          const classMeta = PLANET_CLASS_META[b.planetClass] || PLANET_CLASS_META.unclassified;
          const isRef = b.isReference === true || b.status === 'reference';
          return (
            <div key={b.id} className="compare-cell compare-col-header">
              <div className="compare-col-title-row">
                <strong>{b.name}</strong>
                <button
                  type="button"
                  className="compare-remove-btn"
                  onClick={() => removeCompareId(b.id)}
                  aria-label={`Remove ${b.name} from comparison`}
                >
                  ×
                </button>
              </div>
              <div className="compare-col-sub">
                <span>Host: {b.hostname}</span>
                {!isRef && (
                  <button
                    type="button"
                    className="compare-focus-btn"
                    onClick={() => selectPlanet(b.id)}
                  >
                    Inspect ↗
                  </button>
                )}
              </div>
              <div className="compare-col-badges">
                {isRef ? (
                  <span className="status-pill">Solar System Reference</span>
                ) : (
                  <span className="class-pill" style={{ borderColor: classMeta.color }}>
                    <span
                      className="planet-class-dot"
                      style={{ backgroundColor: classMeta.color }}
                    />
                    {classMeta.label} (Artist&apos;s impression)
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Multi-Solution DISPUTE Consensus Row */}
        <div className="compare-row-group">
          <div className="compare-cell compare-row-label">
            <span>Published Solutions</span>
            <code className="field-key-tag">DISPUTE</code>
          </div>
          {bodies.map((b) => {
            if (b.isReference) {
              return (
                <div key={`${b.id}-dispute`} className="compare-cell">
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Verified Planetary Fact Sheet</span>
                </div>
              );
            }
            const disp = b.dispute;
            if (!disp || disp.available === false) {
              return (
                <div key={`${b.id}-dispute`} className="compare-cell">
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>1 published solution</span>
                </div>
              );
            }
            if (disp.disputed === true || disp.contested === true) {
              return (
                <div key={`${b.id}-dispute`} className="compare-cell">
                  <span style={{ color: '#fca5a5', fontWeight: 600, fontSize: '11px' }}>
                    ⚠ Disputed ({disp.nSolutions || 'multiple'} solutions)
                  </span>
                </div>
              );
            }
            if (disp.disputed === false || disp.contested === false) {
              return (
                <div key={`${b.id}-dispute`} className="compare-cell">
                  <span style={{ color: '#86efac', fontWeight: 600, fontSize: '11px' }}>
                    ✓ Uncontested ({disp.nSolutions || 'multiple'} solutions agree)
                  </span>
                </div>
              );
            }
            return (
              <div key={`${b.id}-dispute`} className="compare-cell">
                <span style={{ fontSize: '11px', color: '#cbd5e1' }}>Cannot assess uncertainties</span>
              </div>
            );
          })}
        </div>

        {/* Core Measurement Rows */}
        {COMPARE_FIELD_KEYS.map((fk) => {
          const meta = FIELD_DICTIONARY[fk] || { label: fk, unit: '' };
          return (
            <div key={fk} className="compare-row-group">
              <div className="compare-cell compare-row-label">
                <span>{meta.shortLabel || meta.label}</span>
                <code className="field-key-tag">{fk}</code>
              </div>
              {bodies.map((b) => {
                const fieldObj = b.fields?.[fk] || null;
                const isMass = fk === 'pl_bmasse';
                return (
                  <div key={`${b.id}-${fk}`} className="compare-cell">
                    <ReceiptChip
                      planetId={b.id}
                      fieldKey={fk}
                      field={fieldObj}
                      unit={meta.unit}
                      snapshotId={snapshotId}
                    />
                    {isMass && (
                      <div className="compare-mass-prov" style={{ marginTop: '2px' }}>
                        Provenance:{' '}
                        {b.massProvenanceLabel === 'unknown' ? (
                          <UnknownValue />
                        ) : (
                          <strong>{b.massProvenanceLabel}</strong>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* HAB-LAB 5 Indicators Rows */}
        {COMPARE_HAB_KEYS.map(({ key, label }) => (
          <div key={key} className="compare-row-group">
            <div className="compare-cell compare-row-label">
              <span>{label}</span>
              <span className="hab-mini-tag">HAB-LAB</span>
            </div>
            {bodies.map((b) => {
              const ind = b.hab?.[key];
              if (!ind) {
                return (
                  <div key={`${b.id}-${key}`} className="compare-cell">
                    <UnknownValue />
                  </div>
                );
              }
              return (
                <div key={`${b.id}-${key}`} className="compare-cell compare-hab-cell">
                  <div className="compare-hab-top">
                    <span className={`hab-conf-badge conf-${ind.confidence}`}>
                      {ind.confidence}
                    </span>
                    <code className="field-key-tag">{ind.status}</code>
                  </div>
                  <div className="compare-hab-label">{ind.label}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ComparePanel;

