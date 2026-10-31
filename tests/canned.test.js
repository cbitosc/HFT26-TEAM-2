/**
 * tests/canned.test.js
 * End-to-end tests for HELM Canned Queries (#1-#5), server `handleHelmRequest`,
 * client `runLocalCannedQuery`, `applyActions`, and `sendHelmMessage` against
 * the real compact snapshot (`2026-10-30-79bb8609`).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HelmResponseSchema } from '../shared/schemas.js';
import { getServerSnapshot } from '../server/helm/snapshotStore.js';
import { handleHelmRequest } from '../server/helm/index.js';
import { resolveReceipt, checkForbiddenVerdicts } from '../server/helm/validate.js';
import { CANNED_QUERIES, runLocalCannedQuery } from '../src/helm/cannedQueries.js';
import { applyActions } from '../src/helm/applyActions.js';
import { sendHelmMessage } from '../src/helm/helmClient.js';
import { useExplorerStore } from '../src/store/explorerStore.js';

describe('HELM Canned Queries & Vertical Slice Integration (Snapshot 2026-10-30-79bb8609)', () => {
  const snapshot = getServerSnapshot();

  beforeEach(() => {
    useExplorerStore.getState().setSnapshotData({
      snapshotId: snapshot.snapshotId,
      manifest: snapshot.manifest,
      galaxy: snapshot.galaxy,
      planets: snapshot.planets,
    });
    useExplorerStore.getState().selectGalaxy();
    useExplorerStore.getState().setHighlightIds([]);
    useExplorerStore.getState().setCompareIds([]);
    useExplorerStore.getState().setTimelineYear(2026);
    useExplorerStore.getState().clearHelmMessages();
  });

  it('loads the canonical snapshot 2026-10-30-79bb8609 into server memory', () => {
    expect(snapshot.snapshotId).toBe('2026-10-30-79bb8609');
    expect(snapshot.planets.length).toBeGreaterThan(5000);
    expect(snapshot.galaxy.length).toBeGreaterThan(4000);
    expect(snapshot.planetById.has('proxima-cen-b')).toBe(true);
    expect(snapshot.planetById.has('trappist-1-e')).toBe(true);
  });

  it('Canned Query #5 ("Fly me to the nearest known exoplanet.") handles the real snapshot tie (Proxima Cen b & Proxima Cen d at system/host distance 1.30119 pc) honestly and focuses Proxima Cen b', async () => {
    const prompt = 'Fly me to the nearest known exoplanet.';

    // 1. Server handleHelmRequest execution
    const serverRes = await handleHelmRequest({
      message: prompt,
      ui: { viewLevel: 'galaxy', selectedPlanetId: null, timelineYear: 2026 },
    });

    expect(serverRes.status).toBe(200);
    const parsed = HelmResponseSchema.parse(serverRes.body);
    expect(parsed.meta.snapshotId).toBe('2026-10-30-79bb8609');
    expect(parsed.meta.source).toBe('canned');
    expect(parsed.meta.model).toBe('deterministic-canned');

    // Verify receipt segments include both tied Proxima Cen planets (1.30119 pc)
    const receiptIds = parsed.segments.filter((s) => s.t === 'receipt').map((s) => s.id);
    expect(receiptIds).toContain('proxima-cen-b.sy_dist');
    expect(receiptIds).toContain('proxima-cen-d.sy_dist');

    const distReceiptB = resolveReceipt('proxima-cen-b.sy_dist', snapshot);
    const distReceiptD = resolveReceipt('proxima-cen-d.sy_dist', snapshot);
    expect(distReceiptB).not.toBeNull();
    expect(distReceiptD).not.toBeNull();
    expect(distReceiptB.field.v).toBeCloseTo(1.30119, 5);
    expect(distReceiptD.field.v).toBeCloseTo(1.30119, 5);

    // Also verify alias resolution for proxima-centauri-b.sy_dist -> proxima-cen-b.sy_dist (1.30119 pc)
    const aliasReceipt = resolveReceipt('proxima-centauri-b.sy_dist', snapshot);
    expect(aliasReceipt).not.toBeNull();
    expect(aliasReceipt.receiptId).toBe('proxima-cen-b.sy_dist');
    expect(aliasReceipt.field.v).toBeCloseTo(1.30119, 5);

    // Every emitted receipt must resolve to a non-null Field in the snapshot
    for (const rid of receiptIds) {
      const resolved = resolveReceipt(rid, snapshot);
      expect(resolved).not.toBeNull();
      expect(resolved.field.v).not.toBeNull();
    }

    // Verify zero habitability verdict violations and explicit system/host distance framing
    const fullText = parsed.segments.map((s) => (s.t === 'text' ? s.v : '')).join(' ');
    expect(checkForbiddenVerdicts(fullText).valid).toBe(true);
    expect(fullText).toContain('system/host star distance');
    expect(fullText).toContain('instantaneous planet-to-Earth ephemeris distance');
    expect(fullText).toContain('Proxima Cen b');
    expect(fullText).toContain('Proxima Cen d');

    // 2. Client runLocalCannedQuery + applyActions against useExplorerStore
    const localRes = runLocalCannedQuery(prompt);
    expect(localRes).toEqual(parsed);

    const actionOutcome = applyActions(localRes.actions, useExplorerStore);
    expect(actionOutcome.rejected).toHaveLength(0);
    expect(actionOutcome.applied).toEqual([
      { type: 'highlight', ids: ['proxima-cen-b', 'proxima-cen-d'], mode: 'set' },
      { type: 'focus', targetId: 'proxima-cen-b', level: 'planet' },
    ]);

    const state = useExplorerStore.getState();
    expect(state.viewLevel).toBe('planet');
    expect(state.selectedPlanetId).toBe('proxima-cen-b');
    expect(state.selectedSystemId).toBe('proxima-cen');
    expect(state.highlightIds).toEqual(['proxima-cen-b', 'proxima-cen-d']);
    expect(state.cameraRequest).toMatchObject({
      level: 'planet',
      targetId: 'proxima-cen-b',
    });
  });

  it('Canned Query #5 also handles a single-winner minimum system/host distance (sy_dist) snapshot honestly', async () => {
    const proxB = snapshot.planetById.get('proxima-cen-b');
    const singlePlanets = [
      proxB,
      ...snapshot.planets.slice(0, 10).filter((p) => p.id !== 'proxima-cen-b' && p.id !== 'proxima-cen-d'),
    ];
    const singlePlanetById = new Map(singlePlanets.map((p) => [p.id, p]));
    const singleSnapshot = {
      ...snapshot,
      planets: singlePlanets,
      planetById: singlePlanetById,
    };

    const res = await handleHelmRequest(
      { message: 'Fly me to the nearest known exoplanet.' },
      { snapshot: singleSnapshot }
    );
    expect(res.status).toBe(200);
    const parsed = HelmResponseSchema.parse(res.body);

    const prose = parsed.segments.map((s) => (s.t === 'text' ? s.v : '')).join(' ');
    expect(prose).toContain('system/host star distance');
    expect(prose).toContain('sole confirmed planet at this minimum system/host distance');
    expect(prose).toContain('Proxima Cen b');

    expect(parsed.actions).toEqual([
      { type: 'highlight', ids: ['proxima-cen-b'], mode: 'set' },
      { type: 'focus', targetId: 'proxima-cen-b', level: 'planet' },
    ]);
  });

  it('Canned Query #1 ("Which planets are about Earth\'s size and sit in the habitable zone?") highlights Earth-sized HZ planets, focuses nearest match, and has zero habitability verdicts', async () => {
    const prompt = "Which planets are about Earth's size and sit in the habitable zone?";

    const serverRes = await handleHelmRequest({ message: prompt });
    expect(serverRes.status).toBe(200);

    const parsed = HelmResponseSchema.parse(serverRes.body);
    expect(parsed.meta.source).toBe('canned');

    // Verify actions: highlight matched Earth-sized HZ planets + focus nearest match
    const highlightAction = parsed.actions.find((a) => a.type === 'highlight');
    const focusAction = parsed.actions.find((a) => a.type === 'focus');

    expect(highlightAction).toBeDefined();
    expect(highlightAction.mode).toBe('set');
    expect(highlightAction.ids.length).toBe(6);

    // Every highlighted planet must satisfy radiusEarth [0.8, 1.25] and optimistic HZ in snapshot
    for (const pid of highlightAction.ids) {
      const planet = snapshot.planetById.get(pid);
      expect(planet).toBeDefined();
      expect(planet.fields.pl_rade.v).toBeGreaterThanOrEqual(0.8);
      expect(planet.fields.pl_rade.v).toBeLessThanOrEqual(1.25);
      expect(['in_conservative', 'in_optimistic_only']).toContain(planet.hab.hzPosition.status);
    }

    expect(focusAction).toBeDefined();
    expect(focusAction.level).toBe('planet');
    expect(focusAction.targetId).toBe(highlightAction.ids[0]);

    // Verify receipts for pl_rade and sy_dist on all highlighted planets
    const receiptIds = parsed.segments.filter((s) => s.t === 'receipt').map((s) => s.id);
    for (const pid of highlightAction.ids) {
      expect(receiptIds).toContain(`${pid}.pl_rade`);
      expect(receiptIds).toContain(`${pid}.sy_dist`);
    }

    // Verify prose contains "habitable zone", "potential habitability indicators", "system/host", and zero verdict bans
    const prose = parsed.segments.map((s) => (s.t === 'text' ? s.v : '')).join(' ');
    expect(prose.toLowerCase()).toContain('habitable zone');
    expect(prose.toLowerCase()).toContain('potential habitability indicators');
    expect(prose.toLowerCase()).toContain('system/host');
    expect(checkForbiddenVerdicts(prose).valid).toBe(true);

    // Apply to store via sendHelmMessage with offline/local fallback when fetch rejects
    const { response } = await sendHelmMessage(prompt, {
      store: useExplorerStore,
      fetchImpl: async () => {
        throw new Error('Simulated offline network failure');
      },
    });

    expect(response.meta.source).toBe('canned');
    const state = useExplorerStore.getState();
    expect(state.viewLevel).toBe('planet');
    expect(state.selectedPlanetId).toBe(highlightAction.ids[0]);
    expect(state.highlightIds).toEqual(highlightAction.ids);
    expect(state.helm.messages).toHaveLength(2);
    expect(state.helm.messages[0].role).toBe('user');
    expect(state.helm.messages[1].role).toBe('assistant');
  });

  it('Canned Query #2 honestly reports Phase 1a multi-solution ps unavailability and returns contested planets when dispute data is available', async () => {
    const prompt = 'Which planets have the most disputed measurements?';

    // 1. Real Phase 1a snapshot (dispute.available === false across all 6,451 planets)
    const res1a = await handleHelmRequest({ message: prompt });
    expect(res1a.status).toBe(200);
    const parsed1a = HelmResponseSchema.parse(res1a.body);
    expect(parsed1a.meta.source).toBe('canned');
    expect(parsed1a.meta.notice).toBe(
      'Multi-solution ps dispute data unavailable in Phase 1a snapshot (pending Phase 1b).'
    );
    const prose1a = parsed1a.segments.map((s) => (s.t === 'text' ? s.v : '')).join(' ');
    expect(prose1a).toContain(
      'Multi-solution parameter dispute data (DISPUTE) is currently unavailable in active snapshot 2026-10-30-79bb8609 because only the composite pscomppars table is loaded in Phase 1a.'
    );
    expect(prose1a).not.toContain('Here are 0 confirmed planets');
    expect(parsed1a.actions).toEqual([{ type: 'highlight', ids: [], mode: 'clear' }]);

    // 2. Mock Phase 1b snapshot where dispute.available === true on a contested planet
    const trappistE = snapshot.planetById.get('trappist-1-e');
    const mockContestedPlanet = {
      ...trappistE,
      dispute: {
        available: true,
        disputed: true,
        level: 'material',
        fields: {
          ...trappistE.dispute.fields,
          pl_rade: {
            n: 4,
            disputed: true,
            spreadPct: 14.2,
            solutions: [],
          },
        },
      },
    };
    const mockPlanets = [
      mockContestedPlanet,
      ...snapshot.planets.slice(0, 5).filter((p) => p.id !== 'trappist-1-e'),
    ];
    const mockSnapshot = {
      ...snapshot,
      planets: mockPlanets,
      planetById: new Map(mockPlanets.map((p) => [p.id, p])),
    };

    const res1b = await handleHelmRequest({ message: prompt }, { snapshot: mockSnapshot });
    expect(res1b.status).toBe(200);
    const parsed1b = HelmResponseSchema.parse(res1b.body);
    expect(parsed1b.meta.notice).toBeNull();
    const receiptIds1b = parsed1b.segments.filter((s) => s.t === 'receipt').map((s) => s.id);
    expect(receiptIds1b).toContain('trappist-1-e.pl_rade');
    expect(receiptIds1b).toContain('trappist-1-e.pl_bmasse');
    expect(parsed1b.actions).toEqual([
      { type: 'highlight', ids: ['trappist-1-e'], mode: 'set' },
      { type: 'focus', targetId: 'trappist-1-e', level: 'planet' },
    ]);
  });

  it('executes Canned Queries #3 and #4 with verified receipts and keeps live AI strictly disabled when no mock llmClient is passed', async () => {
    for (const cq of CANNED_QUERIES) {
      const res = await handleHelmRequest({ message: cq.prompt });
      expect(res.status).toBe(200);
      const parsed = HelmResponseSchema.parse(res.body);
      expect(parsed.meta.source).toBe('canned');
      expect(parsed.segments.length).toBeGreaterThan(0);
      expect(parsed.actions.length).toBeGreaterThan(0);
    }

    // Check Canned #3 (Compare TRAPPIST-1 e with Earth)
    const res3 = runLocalCannedQuery('canned-3');
    const receipts3 = res3.segments.filter((s) => s.t === 'receipt').map((s) => s.id);
    expect(receipts3).toEqual([
      'trappist-1-e.pl_rade',
      'trappist-1-e.pl_bmasse',
      'trappist-1-e.pl_orbper',
      'trappist-1-e.pl_eqt',
      'trappist-1-e.sy_dist',
    ]);
    applyActions(res3.actions, useExplorerStore);
    expect(useExplorerStore.getState().compareIds).toEqual(['trappist-1-e', 'earth']);
    expect(useExplorerStore.getState().selectedPlanetId).toBe('trappist-1-e');

    // Check Canned #4 (Show discoveries through 2015)
    const res4 = runLocalCannedQuery('canned-4');
    const receipts4 = res4.segments.filter((s) => s.t === 'receipt').map((s) => s.id);
    expect(receipts4).toContain('51-peg-b.pl_orbper');
    expect(receipts4).toContain('51-peg-b.sy_dist');
    expect(receipts4).toContain('kepler-186-f.pl_rade');
    expect(receipts4).toContain('kepler-186-f.sy_dist');
    applyActions(res4.actions, useExplorerStore);
    expect(useExplorerStore.getState().timelineYear).toBe(2015);
    expect(useExplorerStore.getState().viewLevel).toBe('galaxy');

    // Check non-canned query when live AI is disabled (no llmClient)
    const fallbackRes = await handleHelmRequest({
      message: 'Show me planets around K2-18',
    });
    expect(fallbackRes.status).toBe(200);
    expect(fallbackRes.body.meta.source).toBe('fallback');
    expect(fallbackRes.body.meta.notice).toBe(
      'Live AI astronomer is currently disabled pending human authorization; showing deterministic archive snapshot results.'
    );
  });
});
