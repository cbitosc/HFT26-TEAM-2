/**
 * src/helm/cannedQueries.js
 * Client-side canned query definitions and local deterministic executor over
 * the browser's loaded `snapshot` (works offline or when live AI is disabled).
 */

import {
  CANNED_QUERIES,
  matchCannedQuery,
  executeCannedQuery,
  buildDeterministicFallback,
} from '../../server/helm/canned.js';
import { useExplorerStore } from '../store/explorerStore.js';

export { CANNED_QUERIES, matchCannedQuery };

/**
 * Executes one of the 5 canned queries locally against the decoded snapshot
 * and returns a `HelmResponseSchema`-validated response object.
 *
 * @param {string} queryIdOrText - Canned query ID (e.g. 'canned-1', 'canned-5') or prompt text
 * @param {object} [snapshot] - Decoded snapshot object (defaults to explorerStore.getState().snapshot)
 */
export function runLocalCannedQuery(queryIdOrText, snapshot = useExplorerStore.getState().snapshot) {
  if (!snapshot || !Array.isArray(snapshot.planets) || !(snapshot.planetById instanceof Map)) {
    throw new Error('Cannot run local canned query before snapshot is loaded.');
  }
  return executeCannedQuery(queryIdOrText, snapshot);
}

/**
 * Produces a deterministic fallback `HelmResponseSchema` response locally from the browser snapshot.
 */
export function runLocalFallbackQuery(
  message,
  snapshot = useExplorerStore.getState().snapshot,
  notice = null
) {
  if (!snapshot || !Array.isArray(snapshot.planets) || !(snapshot.planetById instanceof Map)) {
    throw new Error('Cannot run local fallback query before snapshot is loaded.');
  }
  return buildDeterministicFallback(message, snapshot, notice);
}
