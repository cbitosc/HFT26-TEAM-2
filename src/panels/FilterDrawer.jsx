/**
 * src/panels/FilterDrawer.jsx
 * Left-rail multi-criteria filter panel, Scientist Mode toggle, 3D highlight trigger,
 * and live matched-planet list over the static snapshot (`shared/filters.js`).
 */

import { useMemo, useState } from 'react';
import { applyFilters } from '../../shared/filters.js';
import { useExplorerStore } from '../store/explorerStore.js';
import { formatNumericValue } from '../data/fieldDictionary.js';
import { UnknownValue } from '../components/UnknownValue.jsx';

const RADIUS_PRESETS = [
  { id: 'all', label: 'All Radii', range: undefined },
  { id: 'earth', label: 'Earth-sized (0.8–1.25 R⊕)', range: { min: 0.8, max: 1.25 } },
  { id: 'superearth', label: 'Super-Earth / Sub-Neptune (1.25–4.0 R⊕)', range: { min: 1.25, max: 4.0 } },
  { id: 'giant', label: 'Gas Giant (> 4.0 R⊕)', range: { min: 4.0 } },
];

export function FilterDrawer() {
  const snapshot = useExplorerStore((s) => s.snapshot);
  const filters = useExplorerStore((s) => s.filters);
  const setFilters = useExplorerStore((s) => s.setFilters);
  const highlightIds = useExplorerStore((s) => s.highlightIds);
  const setHighlightIds = useExplorerStore((s) => s.setHighlightIds);
  const scientistMode = useExplorerStore((s) => s.scientistMode);
  const setScientistMode = useExplorerStore((s) => s.setScientistMode);
  const selectPlanet = useExplorerStore((s) => s.selectPlanet);
  const compareIds = useExplorerStore((s) => s.compareIds);
  const setCompareIds = useExplorerStore((s) => s.setCompareIds);
  const addCompareId = useExplorerStore((s) => s.addCompareId);
  const removeCompareId = useExplorerStore((s) => s.removeCompareId);
  const setCompareOpen = useExplorerStore((s) => s.setCompareOpen);

  const distinctMethods = useMemo(() => {
    if (!snapshot?.planets) return [];
    const counts = new Map();
    for (const p of snapshot.planets) {
      const m = p.discovery?.method;
      if (m) {
        counts.set(m, (counts.get(m) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([method, count]) => ({ method, count }));
  }, [snapshot]);

  const hasDisputeData = useMemo(() => {
    return snapshot?.planets?.some((p) => p.dispute?.available === true) ?? false;
  }, [snapshot]);

  const filteredPlanets = useMemo(() => {
    if (!snapshot?.planets) return [];
    return applyFilters(snapshot.planets, {
      ...filters,
      sortBy: filters.sortBy || 'distance',
      sortDir: filters.sortDir || 'asc',
    });
  }, [snapshot, filters]);

  const totalPlanets = snapshot?.planets?.length ?? 0;

  function updateFilterKey(key, value) {
    const next = { ...filters };
    if (value === undefined || value === null || value === '') {
      delete next[key];
    } else {
      next[key] = value;
    }
    setFilters(next);
  }

  function handleRadiusBoundChange(bound, rawValue) {
    const trimmed = String(rawValue).trim();
    const num = trimmed === '' ? undefined : Number(trimmed);
    const current = { ...(filters.radiusEarth || {}) };
    if (num === undefined || !Number.isFinite(num)) {
      delete current[bound];
    } else {
      current[bound] = num;
    }
    if (current.min === undefined && current.max === undefined) {
      updateFilterKey('radiusEarth', undefined);
    } else {
      updateFilterKey('radiusEarth', current);
    }
  }

  function handleHighlightMatches() {
    const topIds = filteredPlanets.slice(0, 50).map((p) => p.id);
    setHighlightIds(topIds);
  }

  function handleClearAll() {
    setFilters({});
    setHighlightIds([]);
  }

  const [compareNotice, setCompareNotice] = useState(null);

  function handleComparePlanets() {
    if (compareIds.length >= 2) {
      setCompareNotice(null);
      setCompareOpen(true);
      return;
    }
    if (compareIds.length === 1) {
      const selected = snapshot?.planetById?.get(compareIds[0]);
      const name = selected?.name || compareIds[0];
      setCompareNotice(
        `1 planet currently selected (${name}). Select at least 1 more planet using "+ Compare" below to compare 2–3 planets.`
      );
      setCompareOpen(true);
      return;
    }
    setCompareNotice(
      'No planets selected for comparison. Please select 2–3 planets using the "+ Compare" buttons on matching planets below.'
    );
  }

  function toggleComparePlanet(planetId) {
    setCompareNotice(null);
    if (compareIds.includes(planetId)) {
      removeCompareId(planetId);
    } else {
      addCompareId(planetId);
    }
  }

  const topPreview = filteredPlanets.slice(0, 8);

  return (
    <div className="rail-card filter-drawer-card" aria-label="Multi-Criteria Filters and Highlights">
      <div className="rail-card-header-row">
        <h2 className="rail-heading">Multi-Criteria Filters</h2>
        <span className="match-count-pill">
          {filteredPlanets.length.toLocaleString('en-US')} / {totalPlanets.toLocaleString('en-US')}
        </span>
      </div>

      {/* Scientist Mode Toggle */}
      <label className="scientist-mode-toggle" htmlFor="scientist-mode-checkbox">
        <input
          id="scientist-mode-checkbox"
          type="checkbox"
          checked={scientistMode}
          onChange={(e) => setScientistMode(e.target.checked)}
        />
        <span className="scientist-toggle-text">
          <strong>Scientist Mode</strong>
          <small>Show inline receipt IDs, provenance types &amp; formulas</small>
        </span>
      </label>

      {/* Habitable Zone Filter */}
      <div className="filter-group">
        <span className="filter-label">Habitable Zone (Kopparapu 2013 Erratum)</span>
        <div className="filter-pill-row" role="group" aria-label="Habitable Zone Filter">
          <button
            type="button"
            className={`filter-pill-btn ${!filters.hz ? 'active' : ''}`}
            onClick={() => updateFilterKey('hz', undefined)}
          >
            All
          </button>
          <button
            type="button"
            className={`filter-pill-btn ${filters.hz === 'in_optimistic' ? 'active' : ''}`}
            onClick={() => updateFilterKey('hz', 'in_optimistic')}
          >
            Optimistic HZ
          </button>
          <button
            type="button"
            className={`filter-pill-btn ${filters.hz === 'in_conservative' ? 'active' : ''}`}
            onClick={() => updateFilterKey('hz', 'in_conservative')}
          >
            Conservative HZ
          </button>
        </div>
      </div>

      {/* Planet Radius Filter (R⊕) */}
      <div className="filter-group">
        <span className="filter-label">Planet Radius (R⊕)</span>
        <div className="filter-preset-grid">
          {RADIUS_PRESETS.map((preset) => {
            const r = filters.radiusEarth;
            const isSelected =
              (!preset.range && !r) ||
              (preset.range &&
                r &&
                r.min === preset.range.min &&
                r.max === preset.range.max);
            return (
              <button
                key={preset.id}
                type="button"
                className={`filter-preset-btn ${isSelected ? 'active' : ''}`}
                onClick={() => updateFilterKey('radiusEarth', preset.range)}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="filter-range-inputs">
          <label className="range-input-wrap">
            <span>Min R⊕</span>
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="Any"
              value={filters.radiusEarth?.min ?? ''}
              onChange={(e) => handleRadiusBoundChange('min', e.target.value)}
              aria-label="Minimum planet radius in Earth radii"
            />
          </label>
          <label className="range-input-wrap">
            <span>Max R⊕</span>
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="Any"
              value={filters.radiusEarth?.max ?? ''}
              onChange={(e) => handleRadiusBoundChange('max', e.target.value)}
              aria-label="Maximum planet radius in Earth radii"
            />
          </label>
        </div>
      </div>

      {/* Discovery Method Filter */}
      <div className="filter-group">
        <label className="filter-label" htmlFor="filter-method-select">
          Discovery Method
        </label>
        <select
          id="filter-method-select"
          className="filter-select"
          value={filters.method || ''}
          onChange={(e) => updateFilterKey('method', e.target.value || undefined)}
        >
          <option value="">All Methods ({totalPlanets.toLocaleString('en-US')})</option>
          {distinctMethods.map(({ method, count }) => (
            <option key={method} value={method}>
              {method} ({count.toLocaleString('en-US')})
            </option>
          ))}
        </select>
      </div>

      {/* Contested Measurements Only (Honest Availability Check) */}
      <div className="filter-group">
        <label className="contested-toggle-row" htmlFor="filter-contested-checkbox">
          <input
            id="filter-contested-checkbox"
            type="checkbox"
            disabled={!hasDisputeData}
            checked={Boolean(filters.contestedOnly && hasDisputeData)}
            onChange={(e) =>
              updateFilterKey('contestedOnly', e.target.checked ? true : undefined)
            }
          />
          <span>Contested Measurements Only (DISPUTE)</span>
        </label>
        {!hasDisputeData && (
          <div className="filter-honest-badge">
            Unavailable in Phase 1a snapshot (pending Phase 1b NASA <code>ps</code> join)
          </div>
        )}
      </div>

      {/* Active Year Filter Indicator (if synced from TimelineBar) */}
      {filters.discYear?.max !== undefined && (
        <div className="filter-active-chip">
          <span>Discovery Year ≤ {filters.discYear.max}</span>
          <button
            type="button"
            className="chip-remove-btn"
            onClick={() => updateFilterKey('discYear', undefined)}
            title="Clear discovery year filter"
          >
            ×
          </button>
        </div>
      )}

      {/* Actions & Match Summary */}
      <div className="filter-summary-box">
        <div className="filter-summary-line">
          <span>Matching Planets:</span>
          <strong>
            {filteredPlanets.length.toLocaleString('en-US')} / {totalPlanets.toLocaleString('en-US')}
          </strong>
        </div>
        <div className="filter-summary-line">
          <span>Highlighted in 3D:</span>
          <strong>{highlightIds.length}</strong>
        </div>
        <div className="filter-action-buttons">
          <button
            type="button"
            className="filter-primary-btn"
            onClick={handleHighlightMatches}
            disabled={filteredPlanets.length === 0}
          >
            Highlight Matches in 3D ({Math.min(50, filteredPlanets.length)})
          </button>
          <button
            type="button"
            className="filter-compare-btn"
            onClick={handleComparePlanets}
            title="Open side-by-side comparison for selected planets"
          >
            ⇄ Compare Planets {compareIds.length > 0 ? `(${compareIds.length}/3)` : ''}
          </button>
          <button
            type="button"
            className="filter-secondary-btn"
            onClick={handleClearAll}
          >
            Clear Filters &amp; Highlights
          </button>
        </div>
        {compareNotice && (
          <div
            className="filter-compare-notice"
            role="alert"
            style={{
              fontSize: '11px',
              color: '#fde68a',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '6px',
              padding: '6px 10px',
              marginTop: '6px',
              lineHeight: 1.4,
            }}
          >
            {compareNotice}
          </div>
        )}
      </div>

      {/* Top Matching Planets Live Preview */}
      <div className="filter-preview-section">
        <div className="filter-preview-header">
          <span>Nearest Matching Planets (Top {topPreview.length})</span>
        </div>
        {topPreview.length === 0 ? (
          <div className="filter-preview-empty">No planets match the current filter criteria.</div>
        ) : (
          <ul className="filter-preview-list" aria-label="Filtered planets preview">
            {topPreview.map((p) => {
              const dist = p.fields?.sy_dist?.v ?? null;
              const rade = p.fields?.pl_rade?.v ?? null;
              const inCompare = compareIds.includes(p.id);
              return (
                <li key={p.id} className="filter-preview-item">
                  <div className="preview-item-info">
                    <span className="preview-planet-name">{p.name}</span>
                    <span className="preview-planet-metrics">
                      {rade !== null ? `${formatNumericValue(rade)} R⊕` : <UnknownValue label="R⊕ unknown" />}
                      {' • '}
                      {dist !== null ? `${formatNumericValue(dist)} pc` : <UnknownValue label="pc unknown" />}
                    </span>
                  </div>
                  <div className="preview-item-actions">
                    <button
                      type="button"
                      className="preview-btn"
                      onClick={() => selectPlanet(p.id)}
                    >
                      Inspect
                    </button>
                    <button
                      type="button"
                      className={`preview-btn ${inCompare ? 'preview-btn-active' : ''}`}
                      onClick={() => toggleComparePlanet(p.id)}
                    >
                      {inCompare ? '✓ Compare' : '+ Compare'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Explicit 3D Integration Status Note */}
      <div className="filter-scene-status-note">
        <strong>3D Scene Status:</strong> <code>highlightIds</code> (amber ring in{' '}
        <code>GalaxyPoints</code>) is wired live; dimming non-matching <code>GalaxyPoints</code> by{' '}
        <code>filters</code> is pending 3D scene integration.
      </div>
    </div>
  );
}

export default FilterDrawer;
