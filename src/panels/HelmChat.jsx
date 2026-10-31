/**
 * src/panels/HelmChat.jsx
 * Floating, expandable HELM Astronomer Copilot dock.
 *
 * Designed for scene-first immersion (ARCHITECTURE.md Section 7 & 8):
 *   - Floats above the 3D scene without taking over or replacing the viewport.
 *   - Supports Minimized (compact floating pill), Open (floating card), and Expanded (larger drawer) modes.
 *   - Provides deterministic canned queries (#1 to #5), free-text fallback,
 *     interactive ReceiptChips, and action execution pills.
 *   - Offline deterministic mock mode (Live Featherless AI disabled pending human approval).
 */

import { useState } from 'react';
import { useExplorerStore } from '../store/explorerStore.js';
import { CANNED_QUERIES } from '../helm/cannedQueries.js';
import { sendHelmMessage } from '../helm/helmClient.js';
import { resolveComparableBody } from '../data/referenceBodies.js';
import { FIELD_DICTIONARY } from '../data/fieldDictionary.js';
import { ReceiptChip } from '../components/ReceiptChip.jsx';
import { UnknownValue } from '../components/UnknownValue.jsx';

function formatActionSummary(action) {
  if (!action || typeof action !== 'object') return 'action';
  switch (action.type) {
    case 'focus':
      return `focus(${action.level}${action.targetId ? `: ${action.targetId}` : ''})`;
    case 'highlight':
      return action.mode === 'clear'
        ? 'highlight(clear)'
        : `highlight(${action.ids?.length || 0} planets)`;
    case 'timeline':
      return `timeline(≤ ${action.year})`;
    case 'open_compare':
      return `open_compare(${(action.ids || []).join(' vs ')})`;
    case 'select':
      return `select(${action.id || 'galaxy'})`;
    default:
      return action.type;
  }
}

function renderMessageSegment(seg, index, snapshot) {
  if (seg.t === 'text') {
    return <span key={index}>{seg.v}</span>;
  }
  if (seg.t === 'receipt') {
    const rawId = String(seg.id || '');
    const dotIdx = rawId.lastIndexOf('.');
    const planetId = dotIdx > 0 ? rawId.slice(0, dotIdx) : '';
    const fieldKey = dotIdx > 0 ? rawId.slice(dotIdx + 1) : rawId;
    const body = resolveComparableBody(planetId, snapshot);
    const fieldObj = body?.fields?.[fieldKey] || null;
    const unit = FIELD_DICTIONARY[fieldKey]?.unit ?? '';

    if (!fieldObj || fieldObj.v === null || fieldObj.v === undefined) {
      return <UnknownValue key={index} label={`${rawId}: unknown`} />;
    }

    return (
      <ReceiptChip
        key={index}
        planetId={body.id || planetId}
        fieldKey={fieldKey}
        field={fieldObj}
        unit={unit}
        snapshotId={snapshot?.snapshotId}
        compact
      />
    );
  }
  return null;
}

export function HelmChat({ isOpen = true, onClose = null }) {
  const helm = useExplorerStore((s) => s.helm);
  const snapshot = useExplorerStore((s) => s.snapshot);
  const viewLevel = useExplorerStore((s) => s.viewLevel);
  const selectedPlanetId = useExplorerStore((s) => s.selectedPlanetId);
  const timelineYear = useExplorerStore((s) => s.timelineYear);
  const clearHelmMessages = useExplorerStore((s) => s.clearHelmMessages);
  const compareIds = useExplorerStore((s) => s.compareIds);
  const setCompareOpen = useExplorerStore((s) => s.setCompareOpen);
  const setCompareIds = useExplorerStore((s) => s.setCompareIds);
  const selectPlanet = useExplorerStore((s) => s.selectPlanet);
  const setTimelineYear = useExplorerStore((s) => s.setTimelineYear);

  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  function handleComparePlanets() {
    setErrorMsg(null);
    if (compareIds.length >= 2) {
      setCompareOpen(true);
      return;
    }
    if (compareIds.length === 1) {
      setErrorMsg(
        `Only 1 planet currently selected in comparison (${compareIds[0]}). Select at least 1 more planet or run query #3 ("Compare TRAPPIST-1 e & Earth") to compare 2–3 bodies.`
      );
      setCompareOpen(true);
      return;
    }
    setErrorMsg(
      'Insufficient planets selected for comparison (0/3). Run query #3 ("Compare TRAPPIST-1 e & Earth") or add planets from cards/filters to compare.'
    );
  }

  const messages = helm?.messages || [];
  const isBusy = helm?.status === 'loading';

  async function handleRunCanned(promptText) {
    if (!snapshot || isBusy) return;
    setErrorMsg(null);
    try {
      await sendHelmMessage(promptText, {
        store: useExplorerStore.getState(),
        preferLocalCanned: true,
      });
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to execute canned query.');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !snapshot || isBusy) return;
    setErrorMsg(null);
    setInput('');
    try {
      await sendHelmMessage(trimmed, {
        store: useExplorerStore.getState(),
        preferLocalCanned: true,
      });
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to execute HELM query.');
    }
  }

  if (!isOpen) {
    return null;
  }

  // Floating Minimized Pill
  if (minimized) {
    return (
      <div className="helm-floating-pill" onClick={() => setMinimized(false)} role="button" tabIndex={0}>
        <span className="helm-pulse-dot" />
        <span className="helm-pill-title">🤖 HELM Astronomer</span>
        <span className="helm-pill-meta">
          {messages.length > 0 ? `${messages.length} msg` : '5 Canned Queries'}
        </span>
        <button
          type="button"
          className="helm-icon-btn"
          onClick={(e) => {
            e.stopPropagation();
            setMinimized(false);
          }}
          title="Expand HELM Copilot"
        >
          ⤢
        </button>
      </div>
    );
  }

  // Floating Open/Expanded Window
  return (
    <section
      className={`helm-floating-window ${expanded ? 'helm-expanded' : ''}`}
      aria-label="HELM Astronomer Copilot"
    >
      {/* Header with Title, Mode & Window Controls */}
      <div className="helm-floating-header">
        <div className="helm-title-group">
          <div className="helm-badge-title">
            <span className="helm-pulse-dot" />
            <span>HELM Astronomer</span>
          </div>
          <span className="helm-mode-badge">
            {helm?.status === 'ready' ? 'Live AI Connected' : 'Deterministic • Canned Fallback'}
          </span>
        </div>

        <div className="helm-window-controls">
          {messages.length > 0 && (
            <button
              type="button"
              className="helm-clear-btn"
              onClick={clearHelmMessages}
              title="Clear transcript log"
            >
              Clear ({messages.length})
            </button>
          )}
          <button
            type="button"
            className="helm-win-btn"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Contract window' : 'Expand window'}
          >
            {expanded ? '⤡' : '⤢'}
          </button>
          <button
            type="button"
            className="helm-win-btn"
            onClick={() => setMinimized(true)}
            title="Minimize to floating pill"
          >
            _
          </button>
          {onClose && (
            <button
              type="button"
              className="helm-win-btn helm-close-btn"
              onClick={onClose}
              title="Close HELM dock"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Context Readout & Compare Action */}
      <div
        className="helm-context-subbar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span>
          Level: <code>{viewLevel}</code>
          {selectedPlanetId ? ` (${selectedPlanetId})` : ''} • Year ≤ <code>{timelineYear}</code>
        </span>
        <button
          type="button"
          className="helm-compare-btn"
          onClick={handleComparePlanets}
          title="Open Side-by-Side Planet Comparison"
        >
          ⇄ Compare Planets {compareIds.length > 0 ? `(${compareIds.length}/3)` : ''}
        </button>
      </div>

      {/* 5 Canonical Canned Query Chips */}
      <div className="helm-canned-row" role="group" aria-label="Canonical HELM Canned Queries">
        <span className="canned-row-label">Canned Queries:</span>
        <div className="canned-chips-wrap">
          {CANNED_QUERIES.map((cq) => (
            <button
              key={cq.id}
              type="button"
              className="helm-canned-chip"
              disabled={!snapshot || isBusy}
              onClick={() => handleRunCanned(cq.prompt)}
              title={cq.prompt}
            >
              <span className="canned-num">#{cq.number}</span> {cq.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <form className="helm-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="helm-text-input"
          placeholder="Ask HELM (deterministic search & canned tools)..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!snapshot || isBusy}
          aria-label="Ask HELM deterministic astronomer"
        />
        <button
          type="submit"
          className="helm-send-btn"
          disabled={!snapshot || isBusy || !input.trim()}
        >
          {isBusy ? 'Running…' : 'Run'}
        </button>
      </form>

      {errorMsg && (
        <div className="helm-error-banner" role="alert">
          {errorMsg}
        </div>
      )}

      {/* Transcript Area */}
      {messages.length > 0 && (
        <div className="helm-transcript" aria-live="polite">
          {messages.map((msg, idx) => {
            if (msg.role === 'user') {
              return (
                <div key={idx} className="helm-msg helm-msg-user">
                  <span className="helm-role-tag">You</span>
                  <span className="helm-user-text">{msg.text}</span>
                </div>
              );
            }

            const sourceLabel =
              msg.meta?.source === 'canned'
                ? 'canned'
                : msg.meta?.source === 'ai'
                  ? 'mock-ai'
                  : 'fallback';

            return (
              <div key={idx} className="helm-msg helm-msg-assistant">
                <div className="helm-msg-top">
                  <span className="helm-role-tag helm-role-bot">HELM</span>
                  <span className={`helm-source-badge source-${sourceLabel}`}>
                    source: {sourceLabel}
                  </span>
                  {msg.meta?.model && (
                    <code className="helm-model-tag">{msg.meta.model}</code>
                  )}
                  {Array.isArray(msg.actions) && msg.actions.length > 0 && (
                    <div className="helm-action-pills">
                      {msg.actions.map((act, aIdx) => (
                        <button
                          key={aIdx}
                          type="button"
                          className="helm-action-pill helm-action-btn"
                          onClick={() => {
                            if (act.type === 'open_compare') {
                              if (Array.isArray(act.ids) && act.ids.length >= 2) {
                                setCompareIds(act.ids);
                                setCompareOpen(true);
                              } else {
                                setErrorMsg('Insufficient planets in compare action (need 2–3).');
                              }
                            } else if (act.type === 'focus') {
                              if (act.targetId) selectPlanet(act.targetId);
                            } else if (act.type === 'timeline') {
                              if (act.year) setTimelineYear(act.year);
                            }
                          }}
                          title={`Click to execute ${act.type} action`}
                        >
                          ⚡ {formatActionSummary(act)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {msg.meta?.notice && (
                  <div className="helm-notice-banner">{msg.meta.notice}</div>
                )}

                <div className="helm-segments-prose">
                  {Array.isArray(msg.segments) && msg.segments.length > 0
                    ? msg.segments.map((seg, sIdx) =>
                        renderMessageSegment(seg, sIdx, snapshot)
                      )
                    : msg.text}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default HelmChat;

