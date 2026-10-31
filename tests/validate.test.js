/**
 * tests/validate.test.js
 * Unit and integration tests for `server/helm/validate.js`, `server/helm/tools.js`,
 * and `handleHelmRequest` mock LLM tool-calling + output validation loop.
 */

import { describe, it, expect } from 'vitest';
import { getServerSnapshot } from '../server/helm/snapshotStore.js';
import {
  stripThinkBlocks,
  checkForbiddenVerdicts,
  resolveReceipt,
  validateReceiptTokens,
  checkNakedNumbers,
  validateActions,
  validateHelmOutput,
} from '../server/helm/validate.js';
import {
  search_planets,
  focus_camera,
  get_planet,
  compare_planets,
  highlight,
  open_timeline,
} from '../server/helm/tools.js';
import { handleHelmRequest } from '../server/helm/index.js';

describe('HELM Output Validator & Tool Executor (server/helm/validate.js & tools.js)', () => {
  const snapshot = getServerSnapshot();

  it('strips <think>...</think> blocks cleanly before validation', () => {
    const raw =
      '<think>Let me calculate 9.99 R⊕ and decide if it is habitable.</think>Proxima Centauri b sits at {{r:proxima-centauri-b.sy_dist}} in the habitable zone.';
    const stripped = stripThinkBlocks(raw);
    expect(stripped).toBe(
      'Proxima Centauri b sits at {{r:proxima-centauri-b.sy_dist}} in the habitable zone.'
    );

    const validated = validateHelmOutput({ text: raw, actions: [] }, snapshot);
    expect(validated.ok).toBe(true);
    expect(validated.errors).toEqual([]);
  });

  it('enforces the Habitability Verdict Ban while allowing "habitable zone" and "potential habitability indicators"', () => {
    // Allowed phrases
    expect(
      checkForbiddenVerdicts(
        'TRAPPIST-1 e orbits in the conservative habitable zone and shows potential habitability indicators.'
      ).valid
    ).toBe(true);

    // Forbidden verdicts
    const bannedSamples = [
      'TRAPPIST-1 e is habitable and has liquid water.',
      'This planet is potentially habitable based on its flux.',
      'Proxima Centauri b supports life.',
      'We think K2-18 b can support life.',
      'Hot Jupiters are uninhabitable.',
      'Kepler-186 f is a habitable world.',
      'This planet is suitable for life.',
      'It is a livable planet.',
    ];

    for (const sample of bannedSamples) {
      const check = checkForbiddenVerdicts(sample);
      expect(check.valid).toBe(false);
      expect(check.violations.length).toBeGreaterThan(0);
    }
  });

  it('validates receipt tokens against snapshot.planetById and strips fabricated receipts', () => {
    const good = resolveReceipt('trappist-1-e.pl_rade', snapshot);
    expect(good).not.toBeNull();
    expect(good.field.v).toBeCloseTo(0.92, 1);

    const fakePlanet = resolveReceipt('fake-planet-99.pl_rade', snapshot);
    expect(fakePlanet).toBeNull();

    const fakeField = resolveReceipt('trappist-1-e.fake_field', snapshot);
    expect(fakeField).toBeNull();

    const tokenCheck = validateReceiptTokens(
      'Valid {{r:trappist-1-e.pl_rade}} vs fabricated {{r:fake-planet.pl_rade}}.',
      snapshot
    );
    expect(tokenCheck.valid).toBe(false);
    expect(tokenCheck.validTokens).toEqual(['trappist-1-e.pl_rade']);
    expect(tokenCheck.invalidTokens).toEqual(['fake-planet.pl_rade']);
    expect(tokenCheck.sanitizedText).toBe('Valid {{r:trappist-1-e.pl_rade}} vs fabricated unknown.');
  });

  it('rejects naked scientific numbers while allowing receipt tokens, years (1992-2026), small counts (<=20), and catalog names', () => {
    // Valid prose with receipts, catalog designations, small count, and discovery year
    const validProse =
      'Found 3 planets in the TRAPPIST-1 system discovered in 2017, including TRAPPIST-1 e with radius {{r:trappist-1-e.pl_rade}} and distance {{r:trappist-1-e.sy_dist}}.';
    expect(checkNakedNumbers(validProse, snapshot).valid).toBe(true);

    // Invalid prose with un-receipted measurements
    const badSamples = [
      'The planet radius is 9.99 R⊕.',
      'Proxima Centauri b is at a distance of 1.3 pc.',
      'It orbits every 11 days.',
      'Equilibrium temperature is 255 K.',
      'Its mass is 0.692 Earth masses.',
      'There are 450 planets in this category.',
    ];

    for (const bad of badSamples) {
      const res = checkNakedNumbers(bad, snapshot);
      expect(res.valid).toBe(false);
      expect(res.nakedNumbers.length).toBeGreaterThan(0);
    }
  });

  it('validates UI actions against HelmActionSchema and snapshot entity existence', () => {
    const check = validateActions(
      [
        { type: 'focus', targetId: 'proxima-centauri-b', level: 'planet' },
        { type: 'focus', targetId: 'nonexistent-planet', level: 'planet' },
        { type: 'highlight', ids: ['trappist-1-e', 'nonexistent-id'], mode: 'set' },
        { type: 'open_compare', ids: ['trappist-1-e', 'earth'] },
        { type: 'timeline', year: 2015, playing: false },
      ],
      snapshot
    );

    expect(check.valid).toBe(false);
    expect(check.validActions).toEqual([
      { type: 'focus', targetId: 'proxima-cen-b', level: 'planet' },
      { type: 'highlight', ids: ['trappist-1-e'], mode: 'set' },
      { type: 'open_compare', ids: ['trappist-1-e', 'earth'] },
      { type: 'timeline', year: 2015, playing: false },
    ]);
    expect(check.rejectedActions).toHaveLength(1);
    expect(check.rejectedActions[0].reason).toBe('unknown_planet');
  });

  it('executes all 6 server tools with Zod validation over the decoded snapshot', () => {
    const sRes = search_planets(
      { radiusEarth: { min: 0.8, max: 1.25 }, hz: 'in_conservative', limit: 3 },
      snapshot
    );
    expect(sRes.ok).toBe(true);
    expect(sRes.rows.length).toBe(3);
    expect(sRes.rows[0].fields.pl_rade.receipt).toBe(`${sRes.rows[0].id}.pl_rade`);

    const badSearch = search_planets({ limit: 99 }, snapshot);
    expect(badSearch.ok).toBe(false);

    const fRes = focus_camera({ level: 'planet', targetId: 'proxima-centauri-b' }, snapshot);
    expect(fRes.ok).toBe(true);
    expect(fRes.actions).toEqual([
      { type: 'focus', targetId: 'proxima-cen-b', level: 'planet' },
    ]);

    const pRes = get_planet({ planetId: 'trappist-1-e' }, snapshot);
    expect(pRes.ok).toBe(true);
    expect(pRes.planet.id).toBe('trappist-1-e');

    const cRes = compare_planets({ planetIds: ['trappist-1-e', 'earth'] }, snapshot);
    expect(cRes.ok).toBe(true);
    expect(cRes.actions).toEqual([{ type: 'open_compare', ids: ['trappist-1-e', 'earth'] }]);

    const hRes = highlight({ planetIds: ['trappist-1-e'], mode: 'set' }, snapshot);
    expect(hRes.ok).toBe(true);

    const tRes = open_timeline({ throughYear: 2016, playing: true }, snapshot);
    expect(tRes.ok).toBe(true);
    expect(tRes.actions).toEqual([{ type: 'timeline', year: 2016, playing: true }]);
  });

  it('handles mock LLM tool calls (search_planets + focus_camera) and retries once when prose violates validator', async () => {
    let callCount = 0;
    const mockLlmClient = async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          model: 'mock-qwen3',
          toolCalls: [
            {
              name: 'search_planets',
              arguments: { nameQuery: 'TRAPPIST-1 e', limit: 1 },
            },
            {
              name: 'focus_camera',
              arguments: { level: 'planet', targetId: 'trappist-1-e' },
            },
          ],
        };
      }
      if (callCount === 2) {
        // First prose attempt violates both naked number and habitability verdict rules
        return {
          model: 'mock-qwen3',
          content:
            '<think>Drafting response</think>TRAPPIST-1 e has radius 0.92 R⊕ and is habitable.',
        };
      }
      // Second prose attempt (after corrective message) obeys all rules
      return {
        model: 'mock-qwen3',
        content:
          'Focused on TRAPPIST-1 e, which has radius {{r:trappist-1-e.pl_rade}} and orbits in the conservative habitable zone.',
      };
    };

    const res = await handleHelmRequest(
      { message: 'Tell me about TRAPPIST-1 e and fly there.' },
      { llmClient: mockLlmClient, snapshot }
    );

    expect(res.status).toBe(200);
    expect(callCount).toBe(3);
    expect(res.body.meta.source).toBe('ai');
    expect(res.body.meta.model).toBe('mock-qwen3');
    expect(res.body.segments).toContainEqual({
      t: 'receipt',
      id: 'trappist-1-e.pl_rade',
    });
    expect(res.body.actions).toEqual([
      { type: 'highlight', ids: ['trappist-1-e'], mode: 'set' },
      { type: 'focus', targetId: 'trappist-1-e', level: 'planet' },
    ]);
  });

  it('falls back to deterministic tool summary if mock LLM fails output validation twice', async () => {
    let callCount = 0;
    const alwaysBadLlm = async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          model: 'mock-qwen3',
          toolCalls: [
            {
              name: 'search_planets',
              arguments: { sortBy: 'distance', sortDir: 'asc', limit: 1 },
            },
          ],
        };
      }
      return {
        model: 'mock-qwen3',
        content: 'Proxima Centauri b is definitely habitable and 4.2 light-years away.',
      };
    };

    const res = await handleHelmRequest(
      { message: 'Check nearest planet with bad model' },
      { llmClient: alwaysBadLlm, snapshot }
    );

    expect(res.status).toBe(200);
    expect(res.body.meta.source).toBe('fallback');
    expect(res.body.segments.some((s) => s.t === 'receipt')).toBe(true);
  });
});
