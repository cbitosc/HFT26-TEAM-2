/**
 * src/helm/applyActions.js
 * Validates HELM UI actions with `HelmActionSchema` and dispatches them
 * to `useExplorerStore`.
 */

import { HelmActionSchema } from '../../shared/schemas.js';
import {
  resolveCanonicalPlanetId,
  resolveCanonicalSystemId,
} from '../../server/helm/validate.js';
import { useExplorerStore } from '../store/explorerStore.js';

function resolveStoreState(storeOrState) {
  if (!storeOrState) return useExplorerStore.getState();
  if (typeof storeOrState.getState === 'function') {
    return storeOrState.getState();
  }
  return storeOrState;
}

/**
 * Validates and executes an array of HELM actions against the Zustand store.
 *
 * @param {Array<object>} actions
 * @param {object} [store] - Zustand store or state object (defaults to `useExplorerStore.getState()`)
 * @returns {{ applied: Array<object>, rejected: Array<object> }}
 */
export function applyActions(actions, store = useExplorerStore.getState()) {
  if (!Array.isArray(actions)) {
    return { applied: [], rejected: [] };
  }

  const applied = [];
  const rejected = [];

  for (const rawAction of actions) {
    const parsed = HelmActionSchema.safeParse(rawAction);
    if (!parsed.success) {
      rejected.push({ action: rawAction, reason: 'schema_invalid' });
      continue;
    }

    const action = parsed.data;
    const state = resolveStoreState(store);
    const snap = state.snapshot;

    switch (action.type) {
      case 'focus': {
        if (action.level === 'galaxy') {
          state.selectGalaxy();
          applied.push(action);
        } else if (action.level === 'system') {
          const canonicalSys = snap
            ? resolveCanonicalSystemId(action.targetId, snap.hostById)
            : action.targetId;
          if (!canonicalSys) {
            rejected.push({ action, reason: 'unknown_system' });
          } else {
            state.selectSystem(canonicalSys);
            applied.push({ ...action, targetId: canonicalSys });
          }
        } else if (action.level === 'planet') {
          const canonicalId = snap
            ? resolveCanonicalPlanetId(action.targetId, snap.planetById)
            : action.targetId;
          if (!canonicalId) {
            rejected.push({ action, reason: 'unknown_planet' });
          } else {
            state.selectPlanet(canonicalId);
            applied.push({ ...action, targetId: canonicalId });
          }
        }
        break;
      }

      case 'highlight': {
        const ids =
          action.mode === 'clear'
            ? []
            : snap
              ? action.ids
                  .map((id) => resolveCanonicalPlanetId(id, snap.planetById))
                  .filter(Boolean)
              : action.ids;
        state.setHighlightIds(ids);
        applied.push({ ...action, ids });
        break;
      }

      case 'timeline': {
        state.setTimelineYear(action.year);
        if (action.playing !== undefined) {
          state.setTimelinePlaying(action.playing);
        }
        applied.push(action);
        break;
      }

      case 'open_compare': {
        state.setCompareIds(action.ids);
        applied.push(action);
        break;
      }

      case 'select': {
        if (action.id === null) {
          state.selectGalaxy();
          applied.push(action);
        } else {
          const canonicalId = snap
            ? resolveCanonicalPlanetId(action.id, snap.planetById)
            : action.id;
          if (!canonicalId) {
            rejected.push({ action, reason: 'unknown_planet' });
          } else {
            state.selectPlanet(canonicalId);
            applied.push({ ...action, id: canonicalId });
          }
        }
        break;
      }

      default:
        rejected.push({ action, reason: 'unsupported_action' });
        break;
    }
  }

  return { applied, rejected };
}
