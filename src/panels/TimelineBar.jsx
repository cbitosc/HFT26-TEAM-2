/**
 * src/panels/TimelineBar.jsx
 * TIMELAPSE discovery scrubber (1992–2026) with live cumulative discovery counts,
 * method breakdown pills with detection bias color matching, and one-click filter synchronization.
 * Synchronized with 3D GalaxyPoints point cloud and HELM open_timeline action.
 */

import { useEffect, useMemo, useState } from 'react';
import { useExplorerStore, selectTimelineStats } from '../store/explorerStore.js';
import { METHOD_COLORS } from '../scene/GalaxyPoints.jsx';
import { DetectionBiasCaveat } from '../components/DetectionBiasCaveat.jsx';

const MIN_YEAR = 1992;
const MAX_YEAR = 2026;
const TOP_METHODS = ['Transit', 'Radial Velocity', 'Microlensing', 'Imaging'];

export function TimelineBar() {
  const snapshot = useExplorerStore((s) => s.snapshot);
  const timelineYear = useExplorerStore((s) => s.timelineYear);
  const setTimelineYear = useExplorerStore((s) => s.setTimelineYear);
  const timelinePlaying = useExplorerStore((s) => s.timelinePlaying);
  const setTimelinePlaying = useExplorerStore((s) => s.setTimelinePlaying);
  const filters = useExplorerStore((s) => s.filters);
  const setFilters = useExplorerStore((s) => s.setFilters);

  const [showCaveat, setShowCaveat] = useState(false);

  // Playback timer: advances year continuously and updates the 3D scene
  useEffect(() => {
    if (!timelinePlaying) return undefined;

    const timer = setInterval(() => {
      const state = useExplorerStore.getState();
      const current = state.timelineYear;
      if (current >= MAX_YEAR) {
        state.setTimelinePlaying(false);
      } else {
        state.setTimelineYear(current + 1);
      }
    }, 650);

    return () => clearInterval(timer);
  }, [timelinePlaying]);

  const stats = useMemo(() => {
    return selectTimelineStats(snapshot, timelineYear);
  }, [snapshot, timelineYear]);

  function handleTogglePlay() {
    if (timelinePlaying) {
      setTimelinePlaying(false);
      return;
    }
    if (timelineYear >= MAX_YEAR) {
      setTimelineYear(MIN_YEAR);
    }
    setTimelinePlaying(true);
  }

  function handleSyncFilter() {
    setFilters({
      ...filters,
      discYear: { max: timelineYear },
    });
  }

  const isSyncedToFilter = filters.discYear?.max === timelineYear;

  return (
    <section className="timeline-bar" aria-label="TIMELAPSE Exoplanet Discovery Scrubber">
      <div className="timeline-top-row">
        <div className="timeline-title-group">
          <span className="timeline-eyebrow">TIMELAPSE • Discovery Era</span>
          <strong className="timeline-year-readout">{timelineYear}</strong>
          <span className="timeline-cumulative-pill">
            <strong>{stats.cumulativeCount.toLocaleString('en-US')}</strong> confirmed through{' '}
            {timelineYear}
            <span className="timeline-year-delta">
              ({stats.inExactYear.toLocaleString('en-US')} in {timelineYear})
            </span>
          </span>
        </div>

        <div className="timeline-method-pills" aria-label="Discovery method breakdown">
          {TOP_METHODS.map((m) => (
            <span key={m} className="timeline-method-pill" title={`${m} discoveries through ${timelineYear}`}>
              <span
                style={{
                  display: 'inline-block',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: METHOD_COLORS[m] || '#94a3b8',
                  marginRight: '4px',
                }}
              />
              <span className="method-pill-name">{m}:</span>{' '}
              <strong>{stats.methodCounts[m].toLocaleString('en-US')}</strong>
            </span>
          ))}
        </div>

        <div
          className="timeline-scene-badge"
          title="Number of 3D host star systems currently visible in the galaxy point cloud"
        >
          Scene: <strong>{stats.visibleHostsCount.toLocaleString('en-US')}</strong> systems visible
        </div>

        <button
          type="button"
          onClick={() => setShowCaveat(!showCaveat)}
          className="timeline-preset-btn"
          style={{ fontSize: '10.5px', padding: '2px 8px' }}
          aria-expanded={showCaveat}
        >
          {showCaveat ? 'Hide Caveat' : 'Bias Caveat'}
        </button>
      </div>

      {showCaveat && (
        <div style={{ marginTop: '6px', marginBottom: '4px' }}>
          <DetectionBiasCaveat />
        </div>
      )}

      <div className="timeline-controls-row">
        <button
          type="button"
          className="timeline-play-btn"
          onClick={handleTogglePlay}
          aria-label={timelinePlaying ? 'Pause discovery timeline' : 'Play discovery timeline'}
        >
          {timelinePlaying ? '⏸ Pause' : '▶ Play'}
        </button>

        <span className="timeline-bound-label">{MIN_YEAR}</span>
        <input
          type="range"
          min={MIN_YEAR}
          max={MAX_YEAR}
          step="1"
          value={timelineYear}
          onChange={(e) => {
            setTimelinePlaying(false);
            setTimelineYear(Number(e.target.value));
          }}
          className="timeline-range-slider"
          aria-label="Discovery year scrubber (1992 to 2026)"
        />
        <span className="timeline-bound-label">{MAX_YEAR}</span>

        <button
          type="button"
          className="timeline-preset-btn"
          onClick={() => {
            setTimelinePlaying(false);
            setTimelineYear(2015);
          }}
        >
          2015 (Kepler Era)
        </button>

        <button
          type="button"
          className="timeline-preset-btn"
          onClick={() => {
            setTimelinePlaying(false);
            setTimelineYear(MAX_YEAR);
          }}
        >
          2026 (All)
        </button>

        <button
          type="button"
          className={`timeline-sync-btn ${isSyncedToFilter ? 'synced' : ''}`}
          onClick={handleSyncFilter}
          title="Filter the left-rail planet list to discoveries through this year"
        >
          {isSyncedToFilter
            ? `✓ Filtered ≤ ${timelineYear}`
            : `Apply Year (≤ ${timelineYear}) to Filter List`}
        </button>
      </div>
    </section>
  );
}

export default TimelineBar;
