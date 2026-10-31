/**
 * src/panels/DisputePanel.jsx
 * Literature parameter disputes (DISPUTE) panel component.
 *
 * Displays:
 *   - Level 1: Intra-NASA multi-solution disputes (honest unavailable state in Phase 1a).
 *   - Level 3: Cross-catalog planet confirmation status (NASA vs exoplanet.eu).
 *   - Level 2: Parameter-level interval overlap agreement for 5 key fields.
 *
 * Rules (AGENTS.md, ARCHITECTURE.md Sections 6.1, 6.5, 6.7, 6.8, 15):
 *   - Exposes safe derived flags only; never displays raw cross-catalog measurements or uncertainties.
 *   - Preserves strict distinction between Level 2 (parameter overlap) and Level 3 (planet confirmation status).
 *   - "not compared" must NEVER appear as "disagree".
 *   - Exo-MerCat is credited strictly as the name-reconciliation bridge.
 *   - Documents that exoplanet.eu was queried via IVOA HEASARC mirror because primary Paris TAP timed out.
 */

import { useEffect, useState } from 'react';
import {
  getCachedCrosscatalogFlags,
  getCrosscatalogFlagsForPlanet,
  getCrosscatalogMeta,
  loadCrosscatalogFlags,
  getSolutionsForPlanet,
  loadPlanetSolutions,
} from '../data/loadSnapshot.js';
import { UnknownValue } from '../components/UnknownValue.jsx';
import { DisputeStripPlot } from './DisputeStripPlot.jsx';

const SUPPORTED_CROSS_CATALOG_FIELDS = [
  { key: 'pl_rade', label: 'Planet Radius', unit: 'R⊕' },
  { key: 'pl_bmasse', label: 'Planet Mass', unit: 'M⊕' },
  { key: 'pl_orbper', label: 'Orbital Period', unit: 'days' },
  { key: 'pl_orbsmax', label: 'Semi-Major Axis', unit: 'AU' },
  { key: 'st_teff', label: 'Stellar Teff', unit: 'K' },
];

function getStatusBadgeStyle(status) {
  switch (status) {
    case 'agree':
      return {
        background: 'rgba(16, 185, 129, 0.16)',
        color: '#6ee7b7',
        border: '1px solid rgba(16, 185, 129, 0.35)',
      };
    case 'disagree':
      return {
        background: 'rgba(239, 68, 68, 0.16)',
        color: '#fca5a5',
        border: '1px solid rgba(239, 68, 68, 0.35)',
      };
    case 'cannot assess':
      return {
        background: 'rgba(234, 179, 8, 0.16)',
        color: '#fde047',
        border: '1px solid rgba(234, 179, 8, 0.35)',
      };
    case 'not compared':
    default:
      return {
        background: 'rgba(148, 163, 184, 0.12)',
        color: '#94a3b8',
        border: '1px solid rgba(148, 163, 184, 0.25)',
      };
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'agree':
      return 'Agree';
    case 'disagree':
      return 'Disagree';
    case 'cannot assess':
      return 'Cannot Assess';
    case 'not compared':
      return 'Not Compared';
    default:
      return 'Unknown';
  }
}

/**
 * Custom hook to safely retrieve cross-catalog flags for a planet.
 */
export function useCrosscatalogFlags(planetId, snapshotId) {
  const [flags, setFlags] = useState(() => getCrosscatalogFlagsForPlanet(planetId));
  const [meta, setMeta] = useState(() => getCrosscatalogMeta());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const existing = getCrosscatalogFlagsForPlanet(planetId);
    if (existing) {
      setFlags(existing);
      setMeta(getCrosscatalogMeta());
      return;
    }

    if (!snapshotId) {
      setFlags(null);
      return;
    }

    setLoading(true);
    loadCrosscatalogFlags(snapshotId)
      .then((data) => {
        if (cancelled) return;
        setLoading(false);
        if (data?.planets?.[planetId]) {
          setFlags(data.planets[planetId]);
          setMeta(data.meta || null);
        } else {
          setFlags(null);
          setMeta(data?.meta || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setFlags(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [planetId, snapshotId]);

  return { flags, meta, loading };
}

/**
 * Custom hook to lazily load individual published solutions for a planet.
 */
export function usePlanetSolutions(planetId, snapshotId) {
  const [solutions, setSolutions] = useState(() => getSolutionsForPlanet(planetId));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const existing = getSolutionsForPlanet(planetId);
    if (existing) {
      setSolutions(existing);
      return;
    }

    if (!snapshotId || !planetId) {
      setSolutions(null);
      return;
    }

    setLoading(true);
    loadPlanetSolutions(snapshotId, planetId)
      .then((data) => {
        if (cancelled) return;
        setLoading(false);
        setSolutions(data || null);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setSolutions(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [planetId, snapshotId]);

  return { solutions, loading };
}

export function DisputePanel({ planet, snapshotId }) {
  const { flags, meta } = useCrosscatalogFlags(planet?.id, snapshotId);
  const { solutions, loading: solutionsLoading } = usePlanetSolutions(planet?.id, snapshotId);
  const [showReconciliation, setShowReconciliation] = useState(false);

  if (!planet) {
    return null;
  }

  const planetLevelStatus = flags?.status ?? 'not compared';
  const isMatched = Boolean(flags?.matched);
  const hasPublishedSolutions = Boolean(solutions && Object.keys(solutions).length > 0);

  return (
    <div className="dispute-panel-container">
      {/* ─── Level 1: Intra-NASA Parameter Disputes & Scientific Strip Plot ─── */}
      <div className="panel-section" style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <h3 className="section-heading" style={{ margin: 0 }}>
            Published Solutions & Literature Disputes (DISPUTE)
          </h3>
          <button
            type="button"
            onClick={() => setShowReconciliation(!showReconciliation)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#38bdf8',
              fontSize: '11px',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            {showReconciliation ? 'Hide Archive Context' : 'Archive Scope (5,505 / 6,451)'}
          </button>
        </div>

        {/* Count Reconciliation Banner (Requirement 11) */}
        {showReconciliation && (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '6px',
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              marginBottom: '10px',
              fontSize: '11.5px',
              color: 'var(--text-secondary, #cbd5e1)',
              lineHeight: 1.45,
            }}
          >
            <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '2px' }}>
              Multi-Solution Literature Count Reconciliation
            </div>
            <div>
              Across the <strong>6,451 confirmed planets</strong> in the active snapshot, exactly{' '}
              <strong>5,505 planets (85.3%)</strong> have multiple published studies (≥ 2 solutions) in NASA <code>ps</code>.
              The remaining 946 planets have single published discovery records. Across the entire archive,{' '}
              <strong>4,312 planets (66.8%)</strong> exhibit at least one contested parameter where independent published
              uncertainty intervals fail to overlap.
            </div>
          </div>
        )}

        {/* Interactive Strip Plot or Loading / Honest Unavailable State */}
        {solutionsLoading ? (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              fontSize: '12px',
              color: 'var(--text-secondary, #94a3b8)',
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '6px',
            }}
          >
            Loading published solutions from NASA archive snapshot…
          </div>
        ) : hasPublishedSolutions ? (
          <DisputeStripPlot planet={planet} solutions={solutions} />
        ) : planet.dispute?.available === false ? (
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
            <UnknownValue label="Single solution only" />
            <p>
              This planet has a single published study in NASA <code>ps</code>.
              Multiple independent solutions are required to assess literature parameter disputes.
            </p>
          </div>
        )}
      </div>

      {/* ─── Levels 2 & 3: Independent Cross-Catalogue Integration ─── */}
      <div className="panel-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 className="section-heading" style={{ margin: 0 }}>
            Cross-Catalogue Comparison (exoplanet.eu)
          </h3>
          <span
            className="status-pill"
            style={{
              ...getStatusBadgeStyle(planetLevelStatus),
              fontSize: '11px',
              padding: '2px 8px',
            }}
          >
            Level 3 Status: {getStatusLabel(planetLevelStatus)}
          </span>
        </div>

        <p className="section-help" style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
          Independent comparison against the Exoplanet Encyclopaedia (<code>exoplanet.eu</code>) using{' '}
          <code>Exo-MerCat</code> strictly as the name-reconciliation bridge. Primary Paris Observatory
          TAP timed out; queried via IVOA HEASARC mirror.
        </p>

        {/* Level 3 Confirmation Status Explanation */}
        <div
          style={{
            padding: '8px 10px',
            borderRadius: '6px',
            background: 'rgba(15, 23, 42, 0.4)',
            border: '1px solid var(--border-subtle)',
            marginBottom: '10px',
            fontSize: '12px',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            Level 3 • Confirmation Status:{' '}
            <span style={{ color: getStatusBadgeStyle(planetLevelStatus).color }}>
              {getStatusLabel(planetLevelStatus)}
            </span>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '11.5px', lineHeight: 1.4 }}>
            {planetLevelStatus === 'agree' && (
              <>Both NASA Exoplanet Archive and Exoplanet Encyclopaedia confirm this planet.</>
            )}
            {planetLevelStatus === 'disagree' && (
              <>
                NASA records this planet as confirmed, but Exoplanet Encyclopaedia lists it as candidate,
                unconfirmed, or retracted.
              </>
            )}
            {planetLevelStatus === 'not compared' && (
              <>
                {isMatched
                  ? 'Planet designation was matched in Exo-MerCat, but Exoplanet Encyclopaedia confirmation status is unassessed or unverified.'
                  : 'Planet designation was not matched in the Exo-MerCat name bridge; comparison status is not assessed (never treated as disagree).'}
              </>
            )}
          </div>
        </div>

        {/* Level 2 Parameter-Level Interval Overlap Agreement */}
        <h4
          style={{
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--text-secondary)',
            margin: '10px 0 6px',
          }}
        >
          Level 2 • Parameter Interval Agreement (5 Fields)
        </h4>

        <div className="field-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {SUPPORTED_CROSS_CATALOG_FIELDS.map(({ key, label, unit }) => {
            const fieldComp = flags?.fields?.[key] || null;
            const paramStatus = fieldComp?.status ?? 'not compared';
            const badgeStyle = getStatusBadgeStyle(paramStatus);

            return (
              <div
                key={key}
                className="field-row"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 8px',
                  background: 'rgba(15, 23, 42, 0.3)',
                  borderRadius: '4px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {label}{' '}
                    <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>({unit})</span>
                  </span>
                  <code style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{key}</code>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    className="status-pill"
                    style={{
                      ...badgeStyle,
                      fontSize: '11px',
                      padding: '2px 8px',
                    }}
                    title={
                      paramStatus === 'agree'
                        ? 'Published parameter intervals overlap between catalogs'
                        : paramStatus === 'disagree'
                        ? 'Published parameter intervals do not overlap'
                        : paramStatus === 'cannot assess'
                        ? 'Uncertainty missing on one or both sides (interval overlap cannot be rigorously assessed)'
                        : 'Measurement absent in one or both catalogs or planet unmatched'
                    }
                  >
                    {getStatusLabel(paramStatus)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Simple Semantics Legend */}
        <div
          style={{
            marginTop: '10px',
            padding: '8px',
            borderRadius: '4px',
            background: 'rgba(15, 23, 42, 0.25)',
            border: '1px dashed var(--border-subtle)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            lineHeight: 1.4,
          }}
        >
          <strong>Explanation of Terms:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: '16px' }}>
            <li>
              <strong style={{ color: '#6ee7b7' }}>Agree:</strong> Reported parameter intervals overlap
              between catalogs.
            </li>
            <li>
              <strong style={{ color: '#fca5a5' }}>Disagree:</strong> Reported parameter intervals are disjoint
              (no overlap).
            </li>
            <li>
              <strong style={{ color: '#fde047' }}>Cannot assess:</strong> Missing uncertainties on one or both
              sides preclude rigorous interval checking.
            </li>
            <li>
              <strong style={{ color: '#94a3b8' }}>Not compared:</strong> Value missing in one or both catalogs,
              or planet designation not matched in bridge.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default DisputePanel;

