/**
 * src/helm/helmClient.js
 * Browser client for HELM (`/api/helm`) with automatic local deterministic
 * fallback when offline or when `/api/helm` is unreachable.
 */

import { HelmRequestSchema, HelmResponseSchema } from '../../shared/schemas.js';
import { useExplorerStore } from '../store/explorerStore.js';
import { applyActions } from './applyActions.js';
import {
  matchCannedQuery,
  runLocalCannedQuery,
  runLocalFallbackQuery,
} from './cannedQueries.js';

function getState(storeOrState) {
  if (!storeOrState) return useExplorerStore.getState();
  if (typeof storeOrState.getState === 'function') {
    return storeOrState.getState();
  }
  return storeOrState;
}

function segmentsToPlainText(segments) {
  if (!Array.isArray(segments)) return '';
  return segments
    .map((s) => (s.t === 'text' ? s.v : `{{r:${s.id}}}`))
    .join('');
}

/**
 * Sends a user message or canned query to HELM, validates the response with
 * `HelmResponseSchema`, appends messages to `explorerStore`, and applies UI actions.
 *
 * @param {string} message
 * @param {object} [options]
 * @param {object} [options.store] - Zustand store or state (defaults to `useExplorerStore`)
 * @param {Function} [options.fetchImpl] - Custom fetch implementation for testing
 * @param {boolean} [options.preferLocalCanned=false] - Run matched canned queries locally without HTTP call
 */
export async function sendHelmMessage(
  message,
  {
    store = useExplorerStore,
    fetchImpl = typeof fetch === 'function' ? fetch : null,
    preferLocalCanned = false,
  } = {}
) {
  const trimmed = String(message || '').trim().slice(0, 500);
  if (!trimmed) {
    throw new Error('HELM message must not be empty.');
  }

  const initialState = getState(store);
  const priorHistory = (initialState.helm?.messages || [])
    .slice(-4)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      text: String(m.text || '').slice(0, 1500),
    }))
    .filter((m) => m.text.length > 0);

  const reqPayload = HelmRequestSchema.parse({
    message: trimmed,
    history: priorHistory,
    ui: {
      viewLevel: initialState.viewLevel || 'galaxy',
      selectedPlanetId: initialState.selectedPlanetId ?? null,
      timelineYear: initialState.timelineYear || 2026,
    },
  });

  initialState.appendHelmMessage({
    role: 'user',
    text: trimmed,
  });
  initialState.setHelmStatus('loading');

  let validatedResponse = null;

  // 1. Optional immediate local execution for canned queries
  if (preferLocalCanned && matchCannedQuery(trimmed) && initialState.snapshot) {
    validatedResponse = runLocalCannedQuery(trimmed, initialState.snapshot);
  }

  // 2. Try POST /api/helm if not already resolved locally
  if (!validatedResponse && fetchImpl) {
    try {
      const res = await fetchImpl('/api/helm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(reqPayload),
      });

      if (res && res.ok) {
        const json = await res.json();
        validatedResponse = HelmResponseSchema.parse(json);
      }
    } catch (_err) {
      // Network or parse failure -> handled by local deterministic fallback below
      validatedResponse = null;
    }
  }

  // 3. Deterministic local fallback if /api/helm was unreachable or returned an error
  if (!validatedResponse) {
    const snap = getState(store).snapshot;
    if (!snap) {
      getState(store).setHelmStatus('unavailable');
      throw new Error('HELM endpoint unreachable and no local snapshot loaded.');
    }
    if (matchCannedQuery(trimmed)) {
      validatedResponse = runLocalCannedQuery(trimmed, snap);
    } else {
      validatedResponse = runLocalFallbackQuery(
        trimmed,
        snap,
        'Server endpoint unreachable; executed deterministic local snapshot search.'
      );
    }
  }

  const currentState = getState(store);
  const assistantText = segmentsToPlainText(validatedResponse.segments);

  currentState.appendHelmMessage({
    role: 'assistant',
    text: assistantText,
    segments: validatedResponse.segments,
    actions: validatedResponse.actions,
    meta: validatedResponse.meta,
  });

  currentState.setHelmStatus(validatedResponse.meta.source === 'ai' ? 'ready' : 'canned');

  const actionResult = applyActions(validatedResponse.actions, store);

  return {
    response: validatedResponse,
    actionResult,
  };
}
