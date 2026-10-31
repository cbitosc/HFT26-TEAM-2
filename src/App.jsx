/**
 * src/App.jsx
 * Application shell for the Team Tetris Exoplanet Explorer (Phase 2 vertical slice).
 * Connects the static snapshot loader, 3D viewport, search bar, breadcrumbs,
 * honest unavailable control rail, Planet Card with provenance receipts, and footer.
 */

import { useEffect } from 'react';
import { useExplorerStore } from './store/explorerStore.js';
import { loadSnapshot } from './data/loadSnapshot.js';
import { SceneRoot } from './scene/SceneRoot.jsx';
import { SearchBar } from './panels/SearchBar.jsx';
import { PlanetCard } from './panels/PlanetCard.jsx';
import { Footer } from './panels/Footer.jsx';
import './App.css';

export function App() {
  const snapshotStatus = useExplorerStore((s) => s.snapshotStatus);
  const snapshotError = useExplorerStore((s) => s.snapshotError);
  const snapshot = useExplorerStore((s) => s.snapshot);
  const viewLevel = useExplorerStore((s) => s.viewLevel);
  const selectedSystemId = useExplorerStore((s) => s.selectedSystemId);
  const selectedPlanetId = useExplorerStore((s) => s.selectedPlanetId);
  const orbitSpeed = useExplorerStore((s) => s.orbitSpeed);

  const selectGalaxy = useExplorerStore((s) => s.selectGalaxy);
  const selectSystem = useExplorerStore((s) => s.selectSystem);
  const stepBack = useExplorerStore((s) => s.stepBack);
  const setOrbitSpeed = useExplorerStore((s) => s.setOrbitSpeed);

  useEffect(() => {
    loadSnapshot().catch(() => {
      // Error state is stored in explorerStore.snapshotError
    });
  }, []);

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

  return (
    <div className="app-shell">
      {/* Top Header Bar */}
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

        {/* Interactive Breadcrumbs & Back Button */}
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

      {/* Main 3-Column Workspace */}
      <main className="app-workspace">
        {/* Left Status & Controls Rail */}
        <aside className="left-rail" aria-label="Catalogue summary and controls">
          <div className="rail-card">
            <h2 className="rail-heading">Snapshot Catalogue Counts</h2>
            {counts ? (
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
            ) : (
              <p className="muted-text">Awaiting snapshot…</p>
            )}
          </div>

          {viewLevel === 'system' && (
            <div className="rail-card">
              <h2 className="rail-heading">System Orbit Controls</h2>
              <label className="slider-label" htmlFor="orbit-speed-slider">
                <span>Orbit Animation Speed</span>
                <code>{orbitSpeed.toFixed(1)}×</code>
              </label>
              <input
                id="orbit-speed-slider"
                type="range"
                min="0"
                max="3"
                step="0.2"
                value={orbitSpeed}
                onChange={(e) => setOrbitSpeed(Number(e.target.value))}
                className="orbit-slider"
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

          {/* Honest Unavailable Controls (No Fake/Simulated Features) */}
          <div className="rail-card rail-unavailable">
            <h2 className="rail-heading">Upcoming Modules</h2>
            <p className="rail-help">
              Clearly marked unavailable in this vertical slice rather than simulated:
            </p>
            <ul className="unavailable-list">
              <li>
                <span className="mod-name">Multi-Criteria Filters Panel</span>
                <span className="unavailable-tag">Unavailable in this preview slice</span>
              </li>
              <li>
                <span className="mod-name">Discovery Timeline Scrubber</span>
                <span className="unavailable-tag">Unavailable in this preview slice</span>
              </li>
              <li>
                <span className="mod-name">VERSUS Planet Comparison</span>
                <span className="unavailable-tag">Unavailable in this preview slice</span>
              </li>
              <li>
                <span className="mod-name">DISPUTE Multi-Solution Diff</span>
                <span className="unavailable-tag">Pending NASA ps table (Phase 1b)</span>
              </li>
              <li>
                <span className="mod-name">HELM AI Astronomer</span>
                <span className="unavailable-tag">Unavailable in this preview slice</span>
              </li>
            </ul>
          </div>
        </aside>

        {/* Center 3D Scene */}
        <section className="center-stage" aria-label="Interactive 3D Exoplanet Viewport">
          <SceneRoot />
        </section>

        {/* Right Inspector / Planet Card Panel */}
        <PlanetCard />
      </main>

      {/* Mandatory Scientific Attribution Footer */}
      <Footer />
    </div>
  );
}

export default App;
