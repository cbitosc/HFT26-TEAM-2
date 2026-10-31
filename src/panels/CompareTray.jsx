/**
 * src/panels/CompareTray.jsx
 * Floating comparison selection tray showing:
 *   - Accurate live selection counter (0/3, 1/3, 2/3, 3/3)
 *   - Selected body pills with single-click removal (×)
 *   - One-click reference presets (TRAPPIST-1 e vs Earth, Proxima Cen b vs Earth)
 *   - Expand / Minimize toggle and Clear action
 */

import { useExplorerStore } from '../store/explorerStore.js';
import { resolveComparableBody } from '../data/referenceBodies.js';

export function CompareTray({ onToggleExpand = null, isExpanded = false }) {
  const storeSnapshot = useExplorerStore((s) => s.snapshot);
  const storeCompareIds = useExplorerStore((s) => s.compareIds);
  const setCompareIds = useExplorerStore((s) => s.setCompareIds);
  const addCompareId = useExplorerStore((s) => s.addCompareId);
  const removeCompareId = useExplorerStore((s) => s.removeCompareId);
  const clearCompareIds = useExplorerStore((s) => s.clearCompareIds);
  const storeSelectedPlanetId = useExplorerStore((s) => s.selectedPlanetId);
  const storeCompareOpen = useExplorerStore((s) => s.compareOpen);
  const setCompareOpen = useExplorerStore((s) => s.setCompareOpen);

  const liveState = typeof window === 'undefined' ? useExplorerStore.getState() : null;
  const snapshot = liveState ? liveState.snapshot : storeSnapshot;
  const compareIds = liveState ? liveState.compareIds : storeCompareIds;
  const selectedPlanetId = liveState ? liveState.selectedPlanetId : storeSelectedPlanetId;
  const compareOpen = liveState ? liveState.compareOpen : storeCompareOpen;

  const bodies = compareIds
    .map((id) => resolveComparableBody(id, snapshot))
    .filter(Boolean);

  const expanded = isExpanded || compareOpen;

  function handleToggle() {
    if (onToggleExpand) {
      onToggleExpand(!expanded);
    } else {
      setCompareOpen(!expanded);
    }
  }

  return (
    <div className="compare-bar-header" role="region" aria-label="Planet comparison selection tray">
      <div className="compare-title-wrap">
        <span className="compare-eyebrow">VERSUS • Comparison</span>
        <span
          className="compare-count-badge"
          aria-live="polite"
          title="Number of bodies selected for comparison (maximum 3)"
        >
          {compareIds.length} / 3 {compareIds.length === 1 ? 'Body' : 'Bodies'}
        </span>
        <span className="no-verdict-badge">Indicators only — no habitability verdict</span>
      </div>

      {/* Selected Body Pills */}
      {bodies.length > 0 && (
        <div className="compare-selected-pills" style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {bodies.map((b) => (
            <span
              key={b.id}
              className="compare-tray-pill"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '999px',
                background: b.isReference ? 'rgba(56, 189, 248, 0.15)' : 'rgba(167, 139, 250, 0.18)',
                border: `1px solid ${b.isReference ? 'rgba(56, 189, 248, 0.45)' : 'rgba(167, 139, 250, 0.45)'}`,
                fontSize: '11px',
                color: b.isReference ? '#7dd3fc' : '#c4b5fd',
              }}
            >
              <span>{b.name}</span>
              <button
                type="button"
                onClick={() => removeCompareId(b.id)}
                aria-label={`Remove ${b.name} from comparison`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  padding: '0 2px',
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Quick Presets & Control Buttons */}
      <div className="compare-quick-actions">
        <button
          type="button"
          className="compare-preset-btn"
          onClick={() => setCompareIds(['trappist-1-e', 'earth'])}
          title="Compare TRAPPIST-1 e against Earth reference baseline"
        >
          TRAPPIST-1 e vs Earth
        </button>

        <button
          type="button"
          className="compare-preset-btn"
          onClick={() => setCompareIds(['proxima-cen-b', 'earth'])}
          title="Compare Proxima Centauri b against Earth reference baseline"
        >
          Proxima Cen b vs Earth
        </button>

        {selectedPlanetId && !compareIds.includes(selectedPlanetId) && (
          <button
            type="button"
            className="compare-preset-btn"
            onClick={() => addCompareId(selectedPlanetId)}
          >
            + Add Selected ({selectedPlanetId})
          </button>
        )}

        {!compareIds.includes('earth') && (
          <button
            type="button"
            className="compare-preset-btn"
            onClick={() => addCompareId('earth')}
          >
            + Earth (Ref)
          </button>
        )}

        {!compareIds.includes('jupiter') && (
          <button
            type="button"
            className="compare-preset-btn"
            onClick={() => addCompareId('jupiter')}
          >
            + Jupiter (Ref)
          </button>
        )}

        {bodies.length > 0 ? (
          <>
            <button
              type="button"
              className="compare-toggle-btn"
              onClick={handleToggle}
              aria-expanded={expanded}
            >
              {expanded ? '▲ Minimize' : '▼ Expand Table'}
            </button>
            <button
              type="button"
              className="compare-clear-btn"
              onClick={clearCompareIds}
            >
              Clear
            </button>
          </>
        ) : (
          <button
            type="button"
            className="compare-clear-btn"
            onClick={() => setCompareOpen(false)}
            title="Close comparison drawer"
          >
            ✕ Close
          </button>
        )}
      </div>
    </div>
  );
}

export default CompareTray;

