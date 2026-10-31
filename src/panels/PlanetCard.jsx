/**
 * src/panels/PlanetCard.jsx
 * Right-hand inspector panel supporting Galaxy overview, System details, and full Planet Card
 * with provenance ReceiptChips, HAB-LAB checklist + DetectionBiasCaveat, and honest unavailable states.
 */

import { useExplorerStore } from '../store/explorerStore.js';
import { FIELD_DICTIONARY, PLANET_CLASS_META, formatNumericValue } from '../data/fieldDictionary.js';
import { ReceiptChip } from '../components/ReceiptChip.jsx';
import { UnknownValue } from '../components/UnknownValue.jsx';
import { DetectionBiasCaveat } from '../components/DetectionBiasCaveat.jsx';

const NOTABLE_SYSTEM_EXAMPLES = [
  { systemId: 'trappist-1', planetId: 'trappist-1-e', label: 'TRAPPIST-1 (7 rocky planets)' },
  { systemId: 'proxima-cen', planetId: 'proxima-cen-b', label: 'Proxima Cen (Nearest host, 1.30 pc)' },
  { systemId: 'kepler-186', planetId: 'kepler-186-f', label: 'Kepler-186 (HZ-band planet f)' },
  { systemId: '51-peg', planetId: '51-peg-b', label: '51 Peg (First 1995 RV hot Jupiter)' },
  { systemId: '55-cnc', planetId: '55-cnc-e', label: '55 Cnc (5-planet system, lava world e)' },
];

const UNPOSITIONED_PLANET_EXAMPLES = [
  { planetId: '2mass-j11011926-7732383-b', label: '2MASS J11011926-7732383 b (Distance null in archive)' },
  { planetId: 'cd-35-2722-b-b', label: 'CD-35 2722 B b (Distance null in archive)' },
  { planetId: 'g-268-110-b', label: 'G 268-110 b (Distance null in archive)' },
];

const PLANET_MEASUREMENT_KEYS = [
  'pl_rade',
  'pl_bmasse',
  'pl_dens',
  'pl_orbper',
  'pl_orbsmax',
  'pl_orbeccen',
  'pl_eqt',
  'pl_insol',
];

const STAR_MEASUREMENT_KEYS = [
  'st_teff',
  'st_rad',
  'st_mass',
  'st_lum',
  'st_lum_linear',
  'sy_dist',
];

const HZ_MEASUREMENT_KEYS = [
  'hz_recent_venus',
  'hz_runaway_greenhouse',
  'hz_moist_greenhouse',
  'hz_max_greenhouse',
  'hz_early_mars',
];

const HAB_INDICATOR_LABELS = [
  { key: 'hzPosition', title: '1. Habitable Zone Position (Kopparapu et al. 2013 Erratum)' },
  { key: 'sizePlausibility', title: '2. Size / Radius Plausibility Band' },
  { key: 'massPlausibility', title: '3. Mass Plausibility & Provenance Band' },
  { key: 'stellarType', title: '4. Host Star Spectral & Teff Context' },
  { key: 'dataCompleteness', title: '5. Archive Parameter Completeness' },
];

function FieldRow({ planetId, fieldKey, field, snapshotId, highlight = false, extraBadge = null }) {
  const meta = FIELD_DICTIONARY[fieldKey] || { label: fieldKey, unit: '', description: '' };
  return (
    <div className={`field-row ${highlight ? 'field-row-featured' : ''}`}>
      <div className="field-row-header">
        <span className="field-label" title={meta.description}>
          {meta.label}
          <code className="field-key-tag">{fieldKey}</code>
        </span>
        {extraBadge}
      </div>
      <div className="field-row-value">
        <ReceiptChip
          planetId={planetId}
          fieldKey={fieldKey}
          field={field}
          unit={meta.unit}
          snapshotId={snapshotId}
          highlight={highlight}
        />
      </div>
    </div>
  );
}

export function PlanetCard() {
  const snapshot = useExplorerStore((s) => s.snapshot);
  const viewLevel = useExplorerStore((s) => s.viewLevel);
  const selectedSystemId = useExplorerStore((s) => s.selectedSystemId);
  const selectedPlanetId = useExplorerStore((s) => s.selectedPlanetId);
  const selectSystem = useExplorerStore((s) => s.selectSystem);
  const selectPlanet = useExplorerStore((s) => s.selectPlanet);

  if (!snapshot) {
    return (
      <aside className="right-panel" aria-label="Inspector panel">
        <div className="panel-section">
          <p className="muted-text">Loading snapshot data…</p>
        </div>
      </aside>
    );
  }

  const { snapshotId } = snapshot;

  // ─── 1. GALAXY VIEW PANEL ────────────────────────────────────────────────────
  if (viewLevel === 'galaxy') {
    return (
      <aside className="right-panel" aria-label="Galaxy overview panel">
        <div className="panel-header">
          <span className="panel-eyebrow">View Level • Galaxy</span>
          <h2 className="panel-title">Solar Neighbourhood &amp; Archive Catalogue</h2>
          <p className="panel-subtitle">
            Click any star in the 3D viewport or use the search bar to inspect a system or planet
            with full provenance receipts.
          </p>
        </div>

        <div className="panel-section">
          <h3 className="section-heading">3D Point Legend</h3>
          <ul className="legend-list">
            <li>
              <span className="legend-dot" style={{ background: '#fde047' }} />
              <span>
                <strong>Sun (Origin)</strong> — Solar System reference at <code>[0, 0, 0]</code> pc
              </span>
            </li>
            <li>
              <span className="legend-dot" style={{ background: '#5eead4' }} />
              <span>
                <strong>HZ-Band Host</strong> — System has ≥1 planet in the Kopparapu HZ band
              </span>
            </li>
            <li>
              <span className="legend-dot" style={{ background: '#93c5fd' }} />
              <span>
                <strong>Multi-Planet Host (3+)</strong> — System with 3 or more confirmed planets
              </span>
            </li>
            <li>
              <span className="legend-dot" style={{ background: '#cbd5e1' }} />
              <span>
                <strong>Confirmed Host Star</strong> — 1–2 confirmed planets
              </span>
            </li>
          </ul>
        </div>

        <div className="panel-section">
          <h3 className="section-heading">Quick Jump: Notable Real Systems</h3>
          <div className="quick-jump-list">
            {NOTABLE_SYSTEM_EXAMPLES.map((item) => (
              <div key={item.systemId} className="quick-jump-row">
                <button
                  type="button"
                  className="quick-jump-btn"
                  onClick={() => selectSystem(item.systemId)}
                >
                  ★ {item.label}
                </button>
                <button
                  type="button"
                  className="quick-jump-subbtn"
                  onClick={() => selectPlanet(item.planetId)}
                  title={`Inspect ${item.planetId} Planet Card`}
                >
                  Planet ↗
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-section">
          <h3 className="section-heading">
            Searchable Planets Without 3D Sky Coordinates (28 in Snapshot)
          </h3>
          <p className="section-help">
            When sky distance (<code>sy_dist</code>) or coordinates are missing in NASA{' '}
            <code>pscomppars</code>, we never invent 3D positions. All 28 remain searchable and
            inspectable:
          </p>
          <div className="quick-jump-list">
            {UNPOSITIONED_PLANET_EXAMPLES.map((item) => (
              <button
                key={item.planetId}
                type="button"
                className="quick-jump-btn quick-jump-unpos"
                onClick={() => selectPlanet(item.planetId)}
              >
                ◌ {item.label}
              </button>
            ))}
          </div>
        </div>
      </aside>
    );
  }

  // ─── 2. SYSTEM VIEW PANEL ────────────────────────────────────────────────────
  if (viewLevel === 'system') {
    const host = snapshot.hostById.get(selectedSystemId) || null;
    const systemPlanets = snapshot.planetsBySystemId.get(selectedSystemId) || [];
    const primaryPlanet = systemPlanets[0] || null;

    if (!host || !primaryPlanet) {
      return (
        <aside className="right-panel" aria-label="System details panel">
          <div className="panel-section">
            <p className="muted-text">No system selected.</p>
          </div>
        </aside>
      );
    }

    return (
      <aside className="right-panel" aria-label={`System details for ${host.hostname}`}>
        <div className="panel-header">
          <span className="panel-eyebrow">View Level • Stellar System</span>
          <h2 className="panel-title">{host.hostname}</h2>
          <div className="badge-row">
            <span className="status-pill">
              {host.planetCount} Confirmed {host.planetCount === 1 ? 'Planet' : 'Planets'}
            </span>
            <span className="impression-pill">Artist&apos;s impression — not to scale</span>
          </div>
        </div>

        {/* 3D Sky Position Provenance */}
        <div className="panel-section">
          <h3 className="section-heading">3D Galactic Position</h3>
          {host.hasPosition && host.posPc ? (
            <div className="position-readout">
              <div>
                <strong>Heliocentric Cartesian (pc):</strong>{' '}
                <code>
                  x={formatNumericValue(host.posPc.x)}, y={formatNumericValue(host.posPc.y)}, z=
                  {formatNumericValue(host.posPc.z)}
                </code>
              </div>
              <div className="muted-small">
                RA {primaryPlanet.system.raDeg ?? 'unknown'}° • Dec{' '}
                {primaryPlanet.system.decDeg ?? 'unknown'}°
              </div>
            </div>
          ) : (
            <div className="unpositioned-banner">
              <UnknownValue label="3D position unknown" /> — sky coordinates or distance (
              <code>sy_dist</code>) missing in archive. Never zero-filled.
            </div>
          )}
        </div>

        {/* Planets in System */}
        <div className="panel-section">
          <h3 className="section-heading">
            Planets in {host.hostname} ({systemPlanets.length})
          </h3>
          <div className="system-planet-list">
            {systemPlanets.map((p) => {
              const cMeta = PLANET_CLASS_META[p.planetClass] || PLANET_CLASS_META.unclassified;
              return (
                <div key={p.id} className="system-planet-card">
                  <div className="system-planet-top">
                    <button
                      type="button"
                      className="system-planet-select-btn"
                      onClick={() => selectPlanet(p.id)}
                    >
                      <span
                        className="planet-class-dot"
                        style={{ backgroundColor: cMeta.color }}
                      />
                      <strong>{p.name}</strong>
                      <span className="inspect-arrow">Inspect Planet Card →</span>
                    </button>
                  </div>
                  <div className="system-planet-metrics">
                    <div className="mini-metric">
                      <span className="mini-label">Radius (pl_rade):</span>
                      <ReceiptChip
                        planetId={p.id}
                        fieldKey="pl_rade"
                        field={p.fields.pl_rade}
                        unit="R⊕"
                        snapshotId={snapshotId}
                      />
                    </div>
                    <div className="mini-metric">
                      <span className="mini-label">Orbit (pl_orbsmax):</span>
                      <ReceiptChip
                        planetId={p.id}
                        fieldKey="pl_orbsmax"
                        field={p.fields.pl_orbsmax}
                        unit="AU"
                        snapshotId={snapshotId}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Host Star Parameters */}
        <div className="panel-section">
          <h3 className="section-heading">Host Star Parameters</h3>
          <div className="field-list">
            <div className="field-row">
              <div className="field-row-header">
                <span className="field-label">Spectral Type</span>
              </div>
              <div className="field-row-value">
                {primaryPlanet.system.spectralType ? (
                  <span className="plain-val">{primaryPlanet.system.spectralType}</span>
                ) : (
                  <UnknownValue />
                )}
              </div>
            </div>
            {STAR_MEASUREMENT_KEYS.map((fk) => (
              <FieldRow
                key={fk}
                planetId={primaryPlanet.id}
                fieldKey={fk}
                field={primaryPlanet.fields[fk]}
                snapshotId={snapshotId}
              />
            ))}
          </div>
        </div>

        {/* Kopparapu HZ Boundaries */}
        <div className="panel-section">
          <h3 className="section-heading">
            Habitable Zone Boundaries (Kopparapu et al. 2013 Erratum)
          </h3>
          <p className="section-help">
            Valid only for host stars with 2,600 K ≤ Teff ≤ 7,200 K and positive bolometric
            luminosity. Out-of-domain stars report grey <UnknownValue />.
          </p>
          <div className="field-list">
            {HZ_MEASUREMENT_KEYS.map((fk) => (
              <FieldRow
                key={fk}
                planetId={primaryPlanet.id}
                fieldKey={fk}
                field={primaryPlanet.fields[fk]}
                snapshotId={snapshotId}
              />
            ))}
          </div>
        </div>
      </aside>
    );
  }

  // ─── 3. PLANET VIEW PANEL (FULL PLANET CARD) ─────────────────────────────────
  const planet = snapshot.planetById.get(selectedPlanetId) || null;
  if (!planet) {
    return (
      <aside className="right-panel" aria-label="Planet card panel">
        <div className="panel-section">
          <p className="muted-text">No planet selected.</p>
        </div>
      </aside>
    );
  }

  const host = snapshot.hostById.get(planet.systemId) || null;
  const classMeta = PLANET_CLASS_META[planet.planetClass] || PLANET_CLASS_META.unclassified;

  return (
    <aside className="right-panel" aria-label={`Planet Card for ${planet.name}`}>
      {/* Planet Header */}
      <div className="panel-header">
        <div className="planet-header-top">
          <span className="panel-eyebrow">View Level • Confirmed Planet Card</span>
          <button
            type="button"
            className="host-link-btn"
            onClick={() => selectSystem(planet.systemId)}
          >
            ★ Host: {planet.hostname} ↗
          </button>
        </div>
        <h2 className="panel-title">{planet.name}</h2>

        <div className="badge-row">
          <span className="status-pill status-confirmed">{planet.status}</span>
          <span
            className="class-pill"
            style={{ borderColor: classMeta.color }}
            title={classMeta.description}
          >
            <span className="planet-class-dot" style={{ backgroundColor: classMeta.color }} />
            {classMeta.label} (Artist&apos;s impression)
          </span>
        </div>

        <div className="discovery-meta-grid">
          <div>
            <span className="meta-label">Discovery Method:</span>{' '}
            {planet.discovery.method ? (
              <strong>{planet.discovery.method}</strong>
            ) : (
              <UnknownValue />
            )}
          </div>
          <div>
            <span className="meta-label">Year:</span>{' '}
            {planet.discovery.year !== null ? (
              <strong>{planet.discovery.year}</strong>
            ) : (
              <UnknownValue />
            )}
          </div>
          <div>
            <span className="meta-label">Facility:</span>{' '}
            {planet.discovery.facility ? (
              <span>{planet.discovery.facility}</span>
            ) : (
              <UnknownValue />
            )}
          </div>
          <div>
            <span className="meta-label">3D Sky Position:</span>{' '}
            {host?.hasPosition ? (
              <span className="pos-tag pos-ok">
                Positioned ({formatNumericValue(host.syDistPc)} pc)
              </span>
            ) : (
              <UnknownValue label="3D position unknown" />
            )}
          </div>
        </div>
      </div>

      {/* Planetary & Orbital Measurements with ReceiptChips */}
      <div className="panel-section">
        <h3 className="section-heading">Planetary &amp; Orbital Measurements</h3>
        <p className="section-help">
          Click any measurement chip to inspect its receipt ID (<code>&lt;planetId&gt;.&lt;field&gt;</code>),
          snapshot hash, formula, inputs, and literature source.
        </p>

        <div className="field-list">
          {PLANET_MEASUREMENT_KEYS.map((fk) => {
            const isRadius = fk === 'pl_rade';
            const isMass = fk === 'pl_bmasse';
            const massBadge = isMass ? (
              <span className="mass-prov-pill" title={`pl_bmassprov: ${planet.massProvenance || 'null'}`}>
                Provenance:{' '}
                {planet.massProvenanceLabel === 'unknown' ? (
                  <UnknownValue />
                ) : (
                  <strong>{planet.massProvenanceLabel}</strong>
                )}
              </span>
            ) : null;

            return (
              <FieldRow
                key={fk}
                planetId={planet.id}
                fieldKey={fk}
                field={planet.fields[fk]}
                snapshotId={snapshotId}
                highlight={isRadius}
                extraBadge={massBadge}
              />
            );
          })}
        </div>
      </div>

      {/* Host Star & Completeness Measurements */}
      <div className="panel-section">
        <h3 className="section-heading">Host Star &amp; Completeness</h3>
        <div className="field-list">
          {STAR_MEASUREMENT_KEYS.map((fk) => (
            <FieldRow
              key={fk}
              planetId={planet.id}
              fieldKey={fk}
              field={planet.fields[fk]}
              snapshotId={snapshotId}
            />
          ))}
          <FieldRow
            planetId={planet.id}
            fieldKey="completeness"
            field={planet.fields.completeness}
            snapshotId={snapshotId}
          />
        </div>
      </div>

      {/* HAB-LAB Potential Habitability Indicators (Never a Verdict) */}
      <div className="panel-section hab-lab-section">
        <div className="section-title-row">
          <h3 className="section-heading">HAB-LAB Potential Habitability Indicators</h3>
          <span className="no-verdict-badge">Indicators Only — No Verdict</span>
        </div>

        <DetectionBiasCaveat />

        <div className="hab-indicator-list">
          {HAB_INDICATOR_LABELS.map(({ key, title }) => {
            const ind = planet.hab?.[key];
            if (!ind) return null;
            return (
              <div key={key} className="hab-indicator-card">
                <div className="hab-indicator-top">
                  <span className="hab-indicator-title">{title}</span>
                  <span className={`hab-conf-badge conf-${ind.confidence}`}>
                    Confidence: {ind.confidence}
                  </span>
                </div>
                <div className="hab-indicator-label">{ind.label}</div>
                {ind.note && <div className="hab-indicator-note">{ind.note}</div>}
                {Array.isArray(ind.receipts) && ind.receipts.length > 0 && (
                  <div className="hab-receipt-pills">
                    {ind.receipts.map((rId) => (
                      <code key={rId} className="receipt-input-pill">
                        {rId}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Disputes Section — Honest Unavailable State in Phase 1a */}
      <div className="panel-section">
        <h3 className="section-heading">Literature Parameter Disputes (DISPUTE)</h3>
        {planet.dispute?.available === false ? (
          <div className="honest-unavailable-box">
            <UnknownValue label="Disputes unavailable" />
            <p>
              Disputes unavailable in Phase 1a snapshot (pending NASA <code>ps</code>{' '}
              multi-solution table in Phase 1b). Never marked &ldquo;uncontested&rdquo; when
              multi-solution data are absent.
            </p>
          </div>
        ) : (
          <div className="honest-unavailable-box">
            <span>Dispute status: {String(planet.dispute?.disputed ?? 'unknown')}</span>
          </div>
        )}
      </div>

      {/* HELM AI Section — Honest Unavailable State */}
      <div className="panel-section">
        <h3 className="section-heading">HELM AI Astronomer</h3>
        <div className="honest-unavailable-box">
          <span className="unavailable-pill">Unavailable in this preview slice</span>
          <p>
            HELM AI Astronomer unavailable in this slice (pending server/model verification).
          </p>
        </div>
      </div>
    </aside>
  );
}

export default PlanetCard;
