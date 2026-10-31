/**
 * src/panels/DisputeStripPlot.jsx
 * Interactive scientific strip plot component for NASA `ps` published planetary solutions.
 *
 * Rules (ARCHITECTURE.md Sections 6.3, 6.5, 7, 12, 15):
 *   - Visualises individual published solutions with their reported uncertainty intervals.
 *   - Supports the 5 architecture-defined parameters: pl_rade, pl_bmasse, pl_orbper, pl_eqt, st_teff.
 *   - Never averages away individual published solutions; preserves exact values and references.
 *   - Clearly distinguishes overlapping intervals, non-overlapping intervals, limit measurements,
 *     and missing uncertainties (never turns missing uncertainty into agreement).
 *   - Uses the precomputed DISPUTE summary from `planet.dispute` as the scientific source of truth;
 *     never independently invents or recalculates status in the UI.
 *   - Accessible and non-specialist friendly with clean visual cues, readable axes, and tooltips.
 */

import { useState } from 'react';

export const DISPUTE_PLOT_FIELDS = [
  { key: 'pl_rade', label: 'Radius', unit: 'R⊕', shortLabel: 'Radius' },
  { key: 'pl_bmasse', label: 'Mass', unit: 'M⊕', shortLabel: 'Mass' },
  { key: 'pl_orbper', label: 'Period', unit: 'days', shortLabel: 'Period' },
  { key: 'pl_eqt', label: 'Eq. Temp', unit: 'K', shortLabel: 'Eq. Temp' },
  { key: 'st_teff', label: 'Stellar Teff', unit: 'K', shortLabel: 'Teff' },
];

function parseRefString(refString) {
  if (!refString || typeof refString !== 'string') {
    return { label: 'Unknown Reference', url: null };
  }
  const hrefMatch = refString.match(/href=([^ >]+)/i);
  const textMatch = refString.match(/>([^<]+)<\/a>/i);
  const url = hrefMatch ? hrefMatch[1].replace(/['"]/g, '') : null;
  const label = textMatch
    ? textMatch[1].trim()
    : refString.replace(/<[^>]+>/g, '').trim() || 'Reference';
  return { label, url };
}

function formatDecimals(val) {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'unknown';
  if (Math.abs(val) >= 1000) return val.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (Math.abs(val) >= 10) return val.toFixed(2);
  if (Math.abs(val) >= 1) return val.toFixed(3);
  return val.toFixed(4);
}

export function DisputeStripPlot({
  planet,
  solutions = null,
  activeField = 'pl_rade',
  onFieldChange = null,
}) {
  const [selectedField, setSelectedField] = useState(activeField);
  const [hoveredSolution, setHoveredSolution] = useState(null);

  const fieldKey = onFieldChange ? activeField : selectedField;
  const handleSelectField = (key) => {
    if (onFieldChange) {
      onFieldChange(key);
    } else {
      setSelectedField(key);
    }
  };

  const currentFieldMeta =
    DISPUTE_PLOT_FIELDS.find((f) => f.key === fieldKey) || DISPUTE_PLOT_FIELDS[0];
  const fieldSolutions = solutions?.[fieldKey] || [];
  const disputeSummary = planet?.dispute?.fields?.[fieldKey] || null;

  // Compute plot domain across all solutions for this field
  let minDomain = Infinity;
  let maxDomain = -Infinity;

  for (const sol of fieldSolutions) {
    if (typeof sol.v !== 'number' || !Number.isFinite(sol.v)) continue;
    const low = sol.e2 !== null ? sol.v + sol.e2 : sol.v;
    const high = sol.e1 !== null ? sol.v + sol.e1 : sol.v;
    if (low < minDomain) minDomain = low;
    if (high > maxDomain) maxDomain = high;
  }

  const hasValidDomain = Number.isFinite(minDomain) && Number.isFinite(maxDomain);
  const span = hasValidDomain ? maxDomain - minDomain : 1;
  const padding = span > 0 ? span * 0.12 : 1;
  const plotMin = hasValidDomain ? minDomain - padding : 0;
  const plotMax = hasValidDomain ? maxDomain + padding : 10;
  const plotRange = Math.max(1e-9, plotMax - plotMin);

  // SVG dimensions
  const svgWidth = 520;
  const marginLeft = 20;
  const marginRight = 20;
  const innerWidth = svgWidth - marginLeft - marginRight;
  const rowHeight = 36;
  const axisHeight = 28;
  const svgHeight = Math.max(80, fieldSolutions.length * rowHeight + axisHeight + 10);

  const scaleX = (val) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return marginLeft;
    const norm = (val - plotMin) / plotRange;
    return marginLeft + Math.max(0, Math.min(innerWidth, norm * innerWidth));
  };

  // Generate 4-5 ticks
  const ticks = [];
  const tickCount = 4;
  for (let i = 0; i <= tickCount; i++) {
    const val = plotMin + (i / tickCount) * plotRange;
    ticks.push({ val, x: scaleX(val) });
  }

  // Dispute verdict styling
  const isContested = disputeSummary?.contested === true;
  const isConsistent = disputeSummary?.contested === false;
  const statusColor = isContested
    ? '#f59e0b' // Amber/Orange
    : isConsistent
      ? '#10b981' // Emerald
      : '#94a3b8'; // Slate

  return (
    <div
      className="dispute-strip-plot-container"
      style={{
        background: 'rgba(15, 23, 42, 0.45)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '14px',
      }}
    >
      {/* ─── Parameter Selection Tabs ─── */}
      <div
        className="dispute-param-tabs"
        role="tablist"
        aria-label="DISPUTE parameter selector"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          marginBottom: '10px',
        }}
      >
        {DISPUTE_PLOT_FIELDS.map((f) => {
          const isActive = f.key === fieldKey;
          const stat = planet?.dispute?.fields?.[f.key];
          const hasDispute = stat?.contested === true;
          const count = solutions?.[f.key]?.length ?? stat?.n ?? 0;

          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleSelectField(f.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: isActive ? 600 : 400,
                background: isActive
                  ? 'rgba(56, 189, 248, 0.16)'
                  : 'rgba(255, 255, 255, 0.04)',
                color: isActive ? '#38bdf8' : 'var(--text-secondary, #94a3b8)',
                border: isActive
                  ? '1px solid rgba(56, 189, 248, 0.4)'
                  : '1px solid rgba(255, 255, 255, 0.06)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{f.shortLabel}</span>
              <span
                style={{
                  fontSize: '9.5px',
                  padding: '1px 4px',
                  borderRadius: '4px',
                  background: hasDispute
                    ? 'rgba(245, 158, 11, 0.25)'
                    : 'rgba(255, 255, 255, 0.08)',
                  color: hasDispute ? '#fbbf24' : 'inherit',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Field Summary Header ─── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '8px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div>
          <span style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>
            {currentFieldMeta.label}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', marginLeft: '6px' }}>
            ({currentFieldMeta.unit})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '999px',
              fontWeight: 500,
              background: isContested
                ? 'rgba(245, 158, 11, 0.15)'
                : isConsistent
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(148, 163, 184, 0.12)',
              color: statusColor,
              border: `1px solid ${statusColor}40`,
            }}
          >
            {isContested
              ? 'Material Dispute'
              : isConsistent
                ? 'Intervals Consistent'
                : 'Cannot Assess'}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)' }}>
            {fieldSolutions.length} {fieldSolutions.length === 1 ? 'solution' : 'solutions'}
          </span>
        </div>
      </div>

      {/* ─── Strip Plot Visualisation ─── */}
      {fieldSolutions.length === 0 ? (
        <div
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            fontSize: '12px',
            color: 'var(--text-secondary, #94a3b8)',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '6px',
          }}
        >
          No individual published solutions recorded for {currentFieldMeta.label} in NASA <code>ps</code>.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: '8px' }}>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            role="img"
            aria-label={`Strip plot of published ${currentFieldMeta.label} solutions`}
          >
            {/* Gridlines from ticks */}
            {ticks.map((t, idx) => (
              <line
                key={idx}
                x1={t.x}
                x2={t.x}
                y1={10}
                y2={svgHeight - axisHeight}
                stroke="rgba(255, 255, 255, 0.06)"
                strokeDasharray="2 3"
              />
            ))}

            {/* Solution Lanes */}
            {fieldSolutions.map((sol, idx) => {
              const y = 20 + idx * rowHeight;
              const isHovered = hoveredSolution === idx;
              const hasErrors =
                sol.e1 !== null && sol.e2 !== null && Number.isFinite(sol.e1) && Number.isFinite(sol.e2);
              const isLimit = sol.lim === 1 || sol.lim === -1;
              const isMissingErr = !hasErrors && !isLimit;

              const xVal = scaleX(sol.v);
              const xLow = hasErrors ? scaleX(sol.v + sol.e2) : xVal;
              const xHigh = hasErrors ? scaleX(sol.v + sol.e1) : xVal;

              const barColor = sol.default
                ? '#38bdf8' // Default is blue
                : isContested
                  ? '#f59e0b'
                  : isConsistent
                    ? '#10b981'
                    : '#94a3b8';

              return (
                <g
                  key={idx}
                  onMouseEnter={() => setHoveredSolution(idx)}
                  onMouseLeave={() => setHoveredSolution(null)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Lane highlight on hover */}
                  {isHovered && (
                    <rect
                      x={0}
                      y={y - 14}
                      width={svgWidth}
                      height={rowHeight - 2}
                      fill="rgba(56, 189, 248, 0.08)"
                      rx={4}
                    />
                  )}

                  {/* Uncertainty Interval Bar */}
                  {hasErrors && (
                    <>
                      {/* Horizontal error line */}
                      <line
                        x1={xLow}
                        x2={xHigh}
                        y1={y}
                        y2={y}
                        stroke={barColor}
                        strokeWidth={isHovered ? 3 : 2}
                        opacity={isHovered ? 1 : 0.85}
                      />
                      {/* Left and right cap ticks */}
                      <line
                        x1={xLow}
                        x2={xLow}
                        y1={y - 4}
                        y2={y + 4}
                        stroke={barColor}
                        strokeWidth={1.5}
                      />
                      <line
                        x1={xHigh}
                        x2={xHigh}
                        y1={y - 4}
                        y2={y + 4}
                        stroke={barColor}
                        strokeWidth={1.5}
                      />
                    </>
                  )}

                  {/* Limit arrow indication */}
                  {isLimit && (
                    <line
                      x1={xVal}
                      x2={sol.lim === 1 ? Math.max(marginLeft, xVal - 35) : Math.min(svgWidth - marginRight, xVal + 35)}
                      y1={y}
                      y2={y}
                      stroke="#c084fc"
                      strokeWidth={2}
                      strokeDasharray="3 2"
                    />
                  )}

                  {/* Missing error dash line */}
                  {isMissingErr && (
                    <line
                      x1={Math.max(marginLeft, xVal - 15)}
                      x2={Math.min(svgWidth - marginRight, xVal + 15)}
                      y1={y}
                      y2={y}
                      stroke="rgba(255, 255, 255, 0.2)"
                      strokeWidth={1.5}
                      strokeDasharray="2 2"
                    />
                  )}

                  {/* Central Measurement Marker */}
                  <circle
                    cx={xVal}
                    cy={y}
                    r={isHovered ? 5.5 : sol.default ? 5 : 4}
                    fill={isLimit ? '#c084fc' : isMissingErr ? '#64748b' : barColor}
                    stroke={sol.default ? '#ffffff' : 'rgba(15, 23, 42, 0.9)'}
                    strokeWidth={sol.default ? 2 : 1}
                  />

                  {/* Default star or label */}
                  {sol.default && (
                    <text
                      x={xVal}
                      y={y - 7}
                      textAnchor="middle"
                      fill="#38bdf8"
                      fontSize={9}
                      fontWeight={700}
                    >
                      ★
                    </text>
                  )}
                </g>
              );
            })}

            {/* Bottom Axis Line */}
            <line
              x1={marginLeft}
              x2={svgWidth - marginRight}
              y1={svgHeight - axisHeight}
              y2={svgHeight - axisHeight}
              stroke="rgba(255, 255, 255, 0.18)"
              strokeWidth={1}
            />

            {/* Ticks & Labels */}
            {ticks.map((t, idx) => (
              <g key={idx}>
                <line
                  x1={t.x}
                  x2={t.x}
                  y1={svgHeight - axisHeight}
                  y2={svgHeight - axisHeight + 4}
                  stroke="rgba(255, 255, 255, 0.3)"
                />
                <text
                  x={t.x}
                  y={svgHeight - axisHeight + 16}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize={10}
                  fontFamily="monospace"
                >
                  {formatDecimals(t.val)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}

      {/* ─── Solution Detail Card (Hovered or Active) ─── */}
      {fieldSolutions.length > 0 && (
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '6px',
            padding: '8px 10px',
            fontSize: '11.5px',
            marginBottom: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          {hoveredSolution !== null && fieldSolutions[hoveredSolution] ? (
            (() => {
              const sol = fieldSolutions[hoveredSolution];
              const parsedRef = parseRefString(sol.ref);
              const isLimit = sol.lim === 1 || sol.lim === -1;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                      {parsedRef.url ? (
                        <a
                          href={parsedRef.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          style={{ color: '#38bdf8', textDecoration: 'none' }}
                        >
                          {parsedRef.label} ↗
                        </a>
                      ) : (
                        parsedRef.label
                      )}
                      {sol.pubdate && (
                        <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: '6px' }}>
                          ({sol.pubdate})
                        </span>
                      )}
                    </span>
                    {sol.default && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#38bdf8',
                          background: 'rgba(56, 189, 248, 0.15)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        Adopted Default
                      </span>
                    )}
                  </div>

                  <div style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '11px' }}>
                    Value:{' '}
                    <strong style={{ color: '#f8fafc' }}>
                      {formatDecimals(sol.v)} {currentFieldMeta.unit}
                    </strong>
                    {sol.e1 !== null && sol.e2 !== null ? (
                      <span style={{ marginLeft: '4px' }}>
                        (+{formatDecimals(sol.e1)} / {formatDecimals(sol.e2)})
                      </span>
                    ) : isLimit ? (
                      <span style={{ color: '#c084fc', marginLeft: '6px' }}>
                        [{sol.lim === 1 ? 'Upper Bound' : 'Lower Bound'}]
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8', marginLeft: '6px' }}>
                        (no uncertainty reported)
                      </span>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            <div style={{ color: '#94a3b8', fontSize: '11px', textAlign: 'center' }}>
              Hover over any point or bar to inspect author reference and published uncertainty.
            </div>
          )}
        </div>
      )}

      {/* ─── Explanatory Legend & Non-Specialist Guide ─── */}
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          paddingTop: '8px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          fontSize: '10.5px',
          color: 'var(--text-secondary, #94a3b8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', display: 'inline-block' }} />
            <span>★ Adopted</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 14, height: 2, background: isContested ? '#f59e0b' : '#10b981', display: 'inline-block' }} />
            <span>Uncertainty (±)</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 10, height: 2, borderTop: '2px dashed #64748b', display: 'inline-block' }} />
            <span>No Error Reported</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#c084fc', fontWeight: 'bold' }}>←</span>
            <span>Limit Bound</span>
          </span>
        </div>
      </div>

      {/* Non-specialist explanation */}
      <p
        style={{
          fontSize: '10.5px',
          color: 'var(--text-secondary, #94a3b8)',
          margin: '6px 0 0',
          lineHeight: 1.4,
        }}
      >
        Each horizontal bar represents an independent study's published measurement with reported uncertainty.
        When error bars fail to overlap, studies report statistically inconsistent measurements for the same planetary property.
      </p>
    </div>
  );
}

export default DisputeStripPlot;

