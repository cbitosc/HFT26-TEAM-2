/**
 * src/panels/CompareDrawer.jsx
 * Composes CompareTray and ComparePanel into a floating bottom drawer.
 * Synchronized with Zustand explorerStore and HELM open_compare actions.
 */

import { useExplorerStore } from '../store/explorerStore.js';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary.jsx';
import { CompareTray } from './CompareTray.jsx';
import { ComparePanel } from './ComparePanel.jsx';

export function CompareDrawer({ isOpen, ids } = {}) {
  const storeCompareIds = useExplorerStore((s) => s.compareIds);
  const storeCompareOpen = useExplorerStore((s) => s.compareOpen);

  const liveState = typeof window === 'undefined' ? useExplorerStore.getState() : null;
  const compareIds = ids ?? (liveState ? liveState.compareIds : storeCompareIds);
  const compareOpen = isOpen ?? (liveState ? liveState.compareOpen : storeCompareOpen);

  if (!compareOpen && compareIds.length === 0) {
    return null;
  }

  const isExpanded = compareOpen;

  return (
    <section
      className={`compare-drawer ${isExpanded ? 'compare-drawer-expanded' : ''}`}
      aria-label="VERSUS Side-by-Side Planet Comparison"
    >
      <CompareTray />
      {isExpanded && (
        <PanelErrorBoundary panelName="Comparison Table">
          <ComparePanel />
        </PanelErrorBoundary>
      )}
    </section>
  );
}

export default CompareDrawer;
