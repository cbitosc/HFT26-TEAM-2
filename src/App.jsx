/**
 * src/App.jsx
 * Scene-First Application Shell for the Team Tetris Exoplanet Explorer.
 *
 * Implements Architecture Sections 7, 7.1, 8, & 5:
 *   - The 3D SceneRoot viewport dominates the full-screen canvas.
 *   - Rigid dashboard walls are eliminated; panels float contextually on demand.
 *   - Floating, expandable HelmChat dock stays accessible without obscuring the scene.
 *   - SearchBar, interactive breadcrumbs, and contextual PlanetCard details are preserved.
 *   - Floating TimelineBar and CompareDrawer float above the scene.
 */

import { useEffect, useState } from 'react';
import { useExplorerStore } from './store/explorerStore.js';
import { loadSnapshot } from './data/loadSnapshot.js';
import { SceneRoot } from './scene/SceneRoot.jsx';
import { SearchBar } from './panels/SearchBar.jsx';
import { FilterDrawer } from './panels/FilterDrawer.jsx';
import { TimelineBar } from './panels/TimelineBar.jsx';
import { CompareDrawer } from './panels/CompareDrawer.jsx';
import { HelmChat } from './panels/HelmChat.jsx';
import { PlanetCard } from './panels/PlanetCard.jsx';
import { Footer } from './panels/Footer.jsx';
import { PanelErrorBoundary } from './components/PanelErrorBoundary.jsx';
import './App.css';

export function App() {
  const snapshotStatus = useExplorerStore((s) => s.snapshotStatus);
  const snapshotError = useExplorerStore((s) => s.snapshotError);
  const snapshot = useExplorerStore((s) => s.snapshot);
  const viewLevel = useExplorerStore((s) => s.viewLevel);
  const selectedSystemId = useExplorerStore((s) => s.selectedSystemId);
  const selectedPlanetId = useExplorerStore((s) => s.selectedPlanetId);
  const orbitSpeed = useExplorerStore((s) => s.orbitSpeed);
  const filters = useExplorerStore((s) => s.filters);

  const selectGalaxy = useExplorerStore((s) => s.selectGalaxy);
  const selectSystem = useExplorerStore((s) => s.selectSystem);
  const stepBack = useExplorerStore((s) => s.stepBack);
  const setOrbitSpeed = useExplorerStore((s) => s.setOrbitSpeed);

  // Scene-first UI visibility toggles
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [showHelm, setShowHelm] = useState(true);

  useEffect(() => {
    loadSnapshot().catch(() => {
      // Error state is stored in explorerStore.snapshotError
    });
  }, []);

  // When user selects a system or planet, open details panel contextually
  useEffect(() => {
    if (viewLevel === 'system' || viewLevel === 'planet') {
      setShowDetails(true);
    }
  }, [viewLevel, selectedSystemId, selectedPlanetId]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (useExplorerStore.getState().viewLevel !== 'galaxy') {
          stepBack();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stepBack]);

  const counts = snapshot?.manifest?.counts || null;
  const selectedHost =
    snapshot && selectedSystemId ? snapshot.hostById.get(selectedSystemId) || null : null;
  const selectedPlanet =
    snapshot && selectedPlanetId ? snapshot.planetById.get(selectedPlanetId) || null : null;

  const unpositionedHostsCount = counts ? counts.hosts - counts.hostsWithPosition : 28;
  const unpositionedPlanetsCount = counts ? counts.planets - counts.planetsWithPosition : 28;
  const activeFilterCount = Object.keys(filters || {}).length;

  return (
    <div className="app-shell">
      {/* Top Floating Glass Header Bar */}
      <header className="app-header">
        <div className="header-brand">
          <button
            type="button"
            className="brand-home-btn"
            onClick={selectGalaxy}
            title="Return to Galaxy View"
          >
            <span className="brand-dot" aria-hidden="true" />
            <span className="brand-title">Team Tetris Exoplanet Explorer</span>
          </button>
          {snapshot?.snapshotId && (
            <span className="snapshot-id-pill" title="Active immutable snapshot ID">
              Snapshot <code>{snapshot.snapshotId}</code>
            </span>
          )}
        </div>

        <SearchBar />

        {/* Interactive Breadcrumbs & HUD Toggles */}
        <div className="header-nav-group">
          <nav className="breadcrumb-nav" aria-label="View hierarchy breadcrumbs">
            {viewLevel !== 'galaxy' && (
              <button
                type="button"
                className="back-btn"
                onClick={stepBack}
                title="Step back one level (Esc)"
              >
                ← Back
              </button>
            )}
            <ol className="breadcrumb-list">
              <li>
                <button
                  type="button"
                  className={`crumb-btn ${viewLevel === 'galaxy' ? 'crumb-active' : ''}`}
                  onClick={selectGalaxy}
                >
                  Galaxy
                </button>
              </li>
              {selectedHost && (
                <>
                  <li className="crumb-sep" aria-hidden="true">
                    ›
                  </li>
                  <li>
                    <button
                      type="button"
                      className={`crumb-btn ${viewLevel === 'system' ? 'crumb-active' : ''}`}
                      onClick={() => selectSystem(selectedHost.systemId)}
                    >
                      {selectedHost.hostname}
                    </button>
                  </li>
                </>
              )}
              {selectedPlanet && viewLevel === 'planet' && (
                <>
                  <li className="crumb-sep" aria-hidden="true">
                    ›
                  </li>
                  <li>
                    <span className="crumb-btn crumb-active">{selectedPlanet.name}</span>
                  </li>
                </>
              )}
            </ol>
          </nav>

          {/* Quick HUD Action Toggles */}
          <div className="header-toggles">
            <button
              type="button"
              className={`toggle-hud-btn ${showFilters ? 'toggle-active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
              title="Toggle multi-criteria filters"
            >
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            <button
              type="button"
              className={`toggle-hud-btn ${showTimeline ? 'toggle-active' : ''}`}
              onClick={() => setShowTimeline(!showTimeline)}
              title="Toggle discovery timeline"
            >
              Timeline
            </button>
            <button
              type="button"
              className={`toggle-hud-btn ${showStats ? 'toggle-active' : ''}`}
              onClick={() => setShowStats(!showStats)}
              title="Toggle snapshot catalogue statistics"
            >
              Stats
            </button>
            <button
              type="button"
              className={`toggle-hud-btn toggle-helm-btn ${showHelm ? 'toggle-active' : ''}`}
              onClick={() => setShowHelm(!showHelm)}
              title="Toggle HELM copilot"
            >
              🤖 HELM
            </button>
            <button
              type="button"
              className={`toggle-hud-btn ${showDetails ? 'toggle-active' : ''}`}
              onClick={() => setShowDetails(!showDetails)}
              title="Toggle inspector details panel"
            >
              {viewLevel === 'planet' ? 'Planet' : viewLevel === 'system' ? 'System' : 'Details'}
            </button>
          </div>
        </div>
      </header>

      {/* Loading / Error Banners */}
      {snapshotStatus === 'loading' && (
        <div className="status-banner status-loading" role="status">
          Loading static NASA Exoplanet Archive snapshot (<code>/snapshots/latest.json</code>)…
        </div>
      )}

      {snapshotStatus === 'error' && (
        <div className="status-banner status-error" role="alert">
          <span>Snapshot load failed: {snapshotError}</span>
          <button
            type="button"
            className="retry-btn"
            onClick={() => loadSnapshot({ force: true })}
          >
            Retry Load
          </button>
        </div>
      )}

      {/* ─── Primary Scene-First Workspace ─── */}
      <main className="scene-first-workspace">
        {/* Fullscreen 3D Viewport Backdrop */}
        <section className="scene-fullscreen-viewport" aria-label="Interactive 3D Exoplanet Viewport">
          <SceneRoot />
        </section>

        {/* Floating System Orbit HUD (Contextual for System View) */}
        {viewLevel === 'system' && (
          <div className="floating-orbit-hud" aria-label="System Orbit Speed HUD">
            <div className="orbit-hud-header">
              <span className="orbit-hud-title">Orbit Speed</span>
              <code>{orbitSpeed.toFixed(1)}×</code>
            </div>
            <input
              id="orbit-speed-slider"
              type="range"
              min="0"
              max="3"
              step="0.2"
              value={orbitSpeed}
              onChange={(e) => setOrbitSpeed(Number(e.target.value))}
              className="orbit-slider"
              aria-label="Orbit animation speed"
            />
            <div className="slider-sub-buttons">
              <button
                type="button"
                className="mini-control-btn"
                onClick={() => setOrbitSpeed(0)}
              >
                Pause (0×)
              </button>
              <button
                type="button"
                className="mini-control-btn"
                onClick={() => setOrbitSpeed(1.0)}
              >
                Reset (1×)
              </button>
            </div>
          </div>
        )}

        {/* Floating Filters Overlay (Contextual On-Demand Drawer) */}
        {showFilters && (
          <aside className="floating-filters-overlay" aria-label="Filters Drawer">
            <div className="floating-overlay-header">
              <span className="floating-overlay-title">Multi-Criteria Filters</span>
              <button
                type="button"
                className="panel-close-btn"
                onClick={() => setShowFilters(false)}
                title="Close Filters Drawer"
              >
                ✕
              </button>
            </div>
            <FilterDrawer />
          </aside>
        )}

        {/* Floating Catalogue Statistics Popover */}
        {showStats && counts && (
          <div className="floating-stats-card" aria-label="Catalogue Counts HUD">
            <div className="floating-overlay-header">
              <span className="floating-overlay-title">Snapshot Catalogue Counts</span>
              <button
                type="button"
                className="panel-close-btn"
                onClick={() => setShowStats(false)}
                title="Close Stats"
              >
                ✕
              </button>
            </div>
            <dl className="counts-grid">
              <div className="count-item">
                <dt>Confirmed Planets</dt>
                <dd>{counts.planets.toLocaleString('en-US')}</dd>
              </div>
              <div className="count-item">
                <dt>Host Stars</dt>
                <dd>{counts.hosts.toLocaleString('en-US')}</dd>
              </div>
              <div className="count-item">
                <dt>3D Positioned Hosts</dt>
                <dd>{counts.hostsWithPosition.toLocaleString('en-US')}</dd>
              </div>
              <div className="count-item">
                <dt>Searchable (No 3D Pos)</dt>
                <dd title="Sky distance missing in archive — never zero-filled">
                  {unpositionedHostsCount} hosts ({unpositionedPlanetsCount} planets)
                </dd>
              </div>
            </dl>
          </div>
        )}

        {/* Floating Planet / System Inspector Panel */}
        <PanelErrorBoundary panelName="Inspector Panel">
          <PlanetCard
            isOpen={showDetails}
            onClose={() => setShowDetails(false)}
          />
        </PanelErrorBoundary>

        {/* Floating Bottom Timeline */}
        {showTimeline && (
          <div className="floating-timeline-bar" aria-label="Discovery Timeline Overlay">
            <TimelineBar />
          </div>
        )}

        {/* Floating Compare Drawer (Slides in on demand) */}
        <PanelErrorBoundary panelName="Compare Drawer">
          <CompareDrawer />
        </PanelErrorBoundary>

        {/* Floating Expandable HELM Copilot Dock */}
        <PanelErrorBoundary panelName="HELM Copilot">
          <HelmChat
            isOpen={showHelm}
            onClose={() => setShowHelm(false)}
          />
        </PanelErrorBoundary>
      </main>

      {/* Mandatory Scientific Attribution Footer */}
      <Footer />
    </div>
  );
}

export default App;
