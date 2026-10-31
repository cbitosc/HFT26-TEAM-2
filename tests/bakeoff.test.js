import { describe, expect, it } from 'vitest';
import {
  ALLOWED_CLI_FLAGS,
  APPROVED_SMOKE_MODELS,
  HARD_SMOKE_MAX_REQUESTS,
  OFFICIAL_FEATHERLESS_BASE_URL,
  executeBakeoff,
  loadLiveApiKey,
  parsePositiveInt,
  resolveConfig,
  runGuardChecks,
  sanitizeErrorMessage,
  validateFeatherlessBaseUrl,
  validateToolCalls,
} from '../scripts/bakeoff-models.js';

describe('scripts/bakeoff-models.js — Safety Guards & Schema Validation', () => {
  describe('CLI flag & mode conflict protection (resolveConfig)', () => {
    it('exports the strict allowed CLI flag list', () => {
      expect(ALLOWED_CLI_FLAGS).toEqual(['--smoke', '--full', '--dry-run', '--verify-guards']);
    });

    it('defaults to strict 2-call smoke mode when no mode flags are passed', () => {
      const cfg = resolveConfig({}, ['--dry-run']);
      expect(cfg.mode).toBe('smoke');
      expect(cfg.isDryRun).toBe(true);
      expect(cfg.baseUrl).toBe(OFFICIAL_FEATHERLESS_BASE_URL);
      expect(cfg.models).toEqual([...APPROVED_SMOKE_MODELS]);
      expect(cfg.prompts).toHaveLength(1);
      expect(cfg.repeats).toBe(1);
      expect(cfg.plannedRequests).toBe(2);
      expect(cfg.maxRequests).toBe(HARD_SMOKE_MAX_REQUESTS);
      expect(cfg.writeReport).toBe(false);
    });

    it('rejects unknown CLI flags or positional arguments before any request or key load', () => {
      for (const badArgv of [
        ['--smok'],
        ['--foo'],
        ['smoke'],
        ['--smoke', '--unknown'],
        ['--url=https://evil.example.com'],
      ]) {
        expect(() => resolveConfig({}, badArgv)).toThrow(/Unknown or unsupported CLI argument/);
      }
    });

    it('rejects --smoke combined with --full on CLI', () => {
      expect(() => resolveConfig({}, ['--smoke', '--full'])).toThrow(
        /Conflicting mode flags: --smoke and --full cannot be combined/
      );
    });

    it('rejects BAKEOFF_MODE=full when --smoke is passed on CLI', () => {
      expect(() => resolveConfig({ BAKEOFF_MODE: 'full' }, ['--smoke'])).toThrow(
        /Conflicting mode configuration: --smoke cannot be combined with BAKEOFF_MODE=full/
      );
    });

    it('rejects BAKEOFF_MODE=full when --full is omitted on CLI (prevents silent env escalation)', () => {
      expect(() => resolveConfig({ BAKEOFF_MODE: 'full' }, [])).toThrow(
        /Conflicting mode configuration: BAKEOFF_MODE=full requires explicit --full CLI flag/
      );
    });

    it('rejects BAKEOFF_MODE=smoke when --full is passed on CLI', () => {
      expect(() => resolveConfig({ BAKEOFF_MODE: 'smoke' }, ['--full'])).toThrow(
        /Conflicting mode configuration: --full cannot be combined with BAKEOFF_MODE=smoke/
      );
    });

    it('rejects invalid BAKEOFF_MODE values', () => {
      expect(() => resolveConfig({ BAKEOFF_MODE: 'invalid' }, ['--smoke'])).toThrow(
        /Invalid BAKEOFF_MODE/
      );
    });

    it('allows full mode only when --full is explicitly passed without conflicting env', () => {
      const cfg = resolveConfig({ BAKEOFF_MODE: 'full' }, ['--full', '--dry-run']);
      expect(cfg.mode).toBe('full');
      expect(cfg.isDryRun).toBe(true);
      expect(cfg.prompts).toHaveLength(5);
      expect(cfg.repeats).toBe(3);
      expect(cfg.plannedRequests).toBe(30);
    });
  });

  describe('Strict URL pinning & redirect blocking', () => {
    it('accepts https://api.featherless.ai/v1 (with or without trailing slash)', () => {
      expect(validateFeatherlessBaseUrl('https://api.featherless.ai/v1')).toBe(
        OFFICIAL_FEATHERLESS_BASE_URL
      );
      expect(validateFeatherlessBaseUrl('https://api.featherless.ai/v1/')).toBe(
        OFFICIAL_FEATHERLESS_BASE_URL
      );
    });

    it('rejects untrusted hosts, HTTP protocol, custom ports, credentials, extra paths, query, or hash', () => {
      const badUrls = [
        'https://evil.example.com/v1',
        'http://api.featherless.ai/v1',
        'https://api.featherless.ai:8443/v1',
        'https://user:pass@api.featherless.ai/v1',
        'https://api.featherless.ai/v2',
        'https://api.featherless.ai/v1/extra',
        'https://api.featherless.ai/v1?redirect=evil',
        'https://api.featherless.ai/v1#section',
        '',
        'not-a-url',
      ];
      for (const badUrl of badUrls) {
        expect(() => validateFeatherlessBaseUrl(badUrl)).toThrow(
          /Untrusted or invalid FEATHERLESS_BASE_URL/
        );
        expect(() => resolveConfig({ FEATHERLESS_BASE_URL: badUrl }, ['--smoke'])).toThrow(
          /Untrusted or invalid FEATHERLESS_BASE_URL/
        );
      }
    });

    it('passes redirect: "error" to fetchImpl and rejects 3xx / redirected responses without reading body or retrying', async () => {
      const cfg = resolveConfig({}, ['--smoke']);
      const seenInits = [];
      let bodyReadCount = 0;

      const mockFetch = async (_url, init) => {
        seenInits.push(init);
        return {
          ok: true,
          status: 302,
          redirected: true,
          json: async () => {
            bodyReadCount += 1;
            return {};
          },
          text: async () => {
            bodyReadCount += 1;
            return 'redirect body';
          },
        };
      };

      const res = await executeBakeoff(cfg, {
        apiKey: 'MOCK_KEY_FOR_TEST',
        fetchImpl: mockFetch,
      });

      expect(seenInits).toHaveLength(2);
      expect(seenInits[0].redirect).toBe('error');
      expect(seenInits[1].redirect).toBe('error');
      expect(bodyReadCount).toBe(0);
      expect(res.requestsMade).toBe(2);
      expect(res.summary[0].runs[0].ok).toBe(false);
      expect(res.summary[0].runs[0].status).toBe(302);
      expect(res.summary[0].runs[0].valid).toBe(false);
    });
  });

  describe('Process environment credential loading & sanitization', () => {
    it('loads FEATHERLESS_API_KEY strictly from the passed env object and throws when missing', () => {
      expect(() => loadLiveApiKey({})).toThrow(
        /Missing FEATHERLESS_API_KEY in process environment/
      );
      expect(() => loadLiveApiKey({ FEATHERLESS_API_KEY: '   ' })).toThrow(
        /Missing FEATHERLESS_API_KEY in process environment/
      );
      expect(loadLiveApiKey({ FEATHERLESS_API_KEY: '  test_env_token_only  ' })).toBe(
        'test_env_token_only'
      );
    });

    it('redacts any accidental key occurrence from error messages', () => {
      const mockEnv = { FEATHERLESS_API_KEY: 'mock_secret_token_xyz' };
      const sanitized = sanitizeErrorMessage(
        new Error('Upstream error with mock_secret_token_xyz in message'),
        mockEnv
      );
      expect(sanitized).toBe('Upstream error with [REDACTED] in message');
      expect(sanitized).not.toContain('mock_secret_token_xyz');
    });
  });

  describe('Zod tool argument validation (shared/schemas.js)', () => {
    it('accepts valid tool calls across all 6 HELM tools', () => {
      const validCases = [
        {
          name: 'search_planets',
          args: { radiusEarth: { min: 0.8, max: 1.6 }, hz: 'in_optimistic', limit: 5 },
        },
        {
          name: 'get_planet',
          args: { planetId: 'trappist-1-e' },
        },
        {
          name: 'compare_planets',
          args: { planetIds: ['trappist-1-e', 'earth'] },
        },
        {
          name: 'focus_camera',
          args: { level: 'planet', targetId: 'proxima-cen-b' },
        },
        {
          name: 'focus_camera',
          args: { level: 'galaxy' },
        },
        {
          name: 'highlight',
          args: { mode: 'set', planetIds: ['trappist-1-e', 'trappist-1-f'] },
        },
        {
          name: 'highlight',
          args: { mode: 'clear' },
        },
        {
          name: 'open_timeline',
          args: { throughYear: 2015, playing: false },
        },
      ];

      for (const tc of validCases) {
        const res = validateToolCalls(
          [
            {
              type: 'function',
              function: { name: tc.name, arguments: JSON.stringify(tc.args) },
            },
          ],
          [tc.name]
        );
        expect(res.valid).toBe(true);
        expect(res.correct).toBe(true);
        expect(res.errors).toEqual([]);
      }
    });

    it('rejects invalid types, out-of-range limits, inverted ranges, missing conditional fields, extra properties, and unknown tools', () => {
      const invalidCases = [
        { name: 'search_planets', args: { limit: '5' } },
        { name: 'search_planets', args: { contestedOnly: 'yes' } },
        { name: 'search_planets', args: { limit: 99 } },
        { name: 'search_planets', args: { limit: 0 } },
        { name: 'search_planets', args: { radiusEarth: { min: 2.0, max: 1.0 } } },
        { name: 'search_planets', args: { hz: 'in_optimistic', extraField: true } },
        { name: 'get_planet', args: { planetId: '' } },
        { name: 'compare_planets', args: { planetIds: ['trappist-1-e'] } },
        { name: 'compare_planets', args: { planetIds: ['a', 'b', 'c', 'd'] } },
        { name: 'focus_camera', args: { level: 'planet' } },
        { name: 'focus_camera', args: { level: 'system', targetId: '   ' } },
        { name: 'highlight', args: { mode: 'set', planetIds: [] } },
        { name: 'highlight', args: { mode: 'set' } },
        { name: 'open_timeline', args: { throughYear: 1800 } },
        { name: 'open_timeline', args: { throughYear: 2050 } },
        { name: 'invent_planets', args: { query: 'habitable' } },
      ];

      for (const tc of invalidCases) {
        const res = validateToolCalls(
          [
            {
              type: 'function',
              function: { name: tc.name, arguments: JSON.stringify(tc.args) },
            },
          ],
          [tc.name]
        );
        expect(res.valid).toBe(false);
        expect(res.correct).toBe(false);
        expect(res.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Offline guard suite & integer parser', () => {
    it('runs the full built-in runGuardChecks suite with zero network calls', async () => {
      const report = await runGuardChecks();
      expect(report.ok).toBe(true);
      expect(report.networkRequests).toBe(0);
      expect(report.credentialsLoaded).toBe(false);
      expect(report.filesWritten).toBe(0);
    });

    it('parsePositiveInt rejects non-positive or malformed strings', () => {
      expect(parsePositiveInt('1', 'TEST')).toBe(1);
      expect(parsePositiveInt('5', 'TEST')).toBe(5);
      for (const bad of ['0', '-2', '1.2', 'abc', '', null, undefined]) {
        expect(() => parsePositiveInt(bad, 'TEST')).toThrow(/Invalid TEST/);
      }
    });
  });
});
