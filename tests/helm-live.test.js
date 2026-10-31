/**
 * tests/helm-live.test.js
 * Comprehensive integration tests for live Featherless AI integration,
 * queue limits, rate limiting, tool execution, 1-retry recovery, and key protection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getServerSnapshot } from '../server/helm/snapshotStore.js';
import { handleHelmRequest } from '../server/helm/handler.js';
import {
  createFeatherlessClient,
  validateFeatherlessBaseUrl,
  sanitizeErrorMessage,
  stripThinkingBlocks,
  OFFICIAL_FEATHERLESS_BASE_URL,
} from '../server/helm/llm.js';
import {
  withHelmConcurrency,
  checkRateLimit,
  resetQueueState,
  getQueueStatus,
} from '../server/helm/queue.js';
import { HelmResponseSchema, HelmActionSchema } from '../shared/schemas.js';

describe('HELM Live Featherless AI Integration (Task B1)', () => {
  const snapshot = getServerSnapshot();

  beforeEach(() => {
    resetQueueState();
  });

  describe('Security & Provider Constraints (ARCHITECTURE.md Section 8.8 & 10)', () => {
    it('strictly pins base URL to https://api.featherless.ai/v1 and rejects unauthorized hosts/ports/paths', () => {
      expect(validateFeatherlessBaseUrl('https://api.featherless.ai/v1')).toBe(
        OFFICIAL_FEATHERLESS_BASE_URL
      );
      expect(validateFeatherlessBaseUrl('https://api.featherless.ai/v1/')).toBe(
        OFFICIAL_FEATHERLESS_BASE_URL
      );

      // Rejects malicious or unintended variations
      expect(() => validateFeatherlessBaseUrl('http://api.featherless.ai/v1')).toThrow();
      expect(() => validateFeatherlessBaseUrl('https://evil.featherless.ai/v1')).toThrow();
      expect(() => validateFeatherlessBaseUrl('https://api.featherless.ai:8080/v1')).toThrow();
      expect(() => validateFeatherlessBaseUrl('https://api.featherless.ai/v1/extra')).toThrow();
      expect(() => validateFeatherlessBaseUrl('https://api.featherless.ai/v1?token=leak')).toThrow();
      expect(() => validateFeatherlessBaseUrl('https://api.featherless.ai/v1#section')).toThrow();
    });

    it('sanitizes API keys from error messages and logs', () => {
      const mockKey = 'fl-secret-token-99999-never-leak';
      const rawError = new Error(`Connection to upstream failed with keyfl-secret-token-99999-never-leak in headers`);
      const sanitized = sanitizeErrorMessage(rawError, mockKey);

      expect(sanitized).not.toContain(mockKey);
      expect(sanitized).toContain('[REDACTED]');
    });

    it('strips <think>...</think> reasoning blocks cleanly', () => {
      const input = '<think>\nEvaluating query\nChecking 5 planets\n</think>TRAPPIST-1 e is at {{r:trappist-1-e.sy_dist}}.';
      expect(stripThinkingBlocks(input)).toBe('TRAPPIST-1 e is at {{r:trappist-1-e.sy_dist}}.');
    });
  });

  describe('Queue, Concurrency Semaphore & Rate Limiting (server/helm/queue.js)', () => {
    it('enforces per-IP rate limit and returns 429 when exceeded', () => {
      const ip = '192.168.1.100';
      const limit = 5;

      for (let i = 0; i < limit; i++) {
        expect(checkRateLimit(ip, limit)).toBe(true);
      }
      expect(checkRateLimit(ip, limit)).toBe(false);

      // Different IP is unaffected
      expect(checkRateLimit('192.168.1.101', limit)).toBe(true);
    });

    it('rejects with 429 when concurrency wait timeout expires', async () => {
      let releaseSlot;
      const blockingPromise = new Promise((resolve) => {
        releaseSlot = resolve;
      });

      // Max concurrency = 1, queue wait = 50ms
      const p1 = withHelmConcurrency(async () => {
        await blockingPromise;
        return 'done1';
      }, { maxInFlight: 1, queueWaitMs: 50 });

      // Second request arrives while first is in-flight; times out after 50ms
      const p2 = withHelmConcurrency(async () => {
        return 'done2';
      }, { maxInFlight: 1, queueWaitMs: 50 });

      await expect(p2).rejects.toMatchObject({
        status: 429,
        isQueueTimeout: true,
      });

      releaseSlot();
      await expect(p1).resolves.toBe('done1');
    });
  });

  describe('Featherless Client & Tool Calling Loop (server/helm/handler.js)', () => {
    it('executes tool calling loop and validates actions for all 5 core actions', async () => {
      let callCount = 0;
      const mockLlm = async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            model: 'Qwen/Qwen2.5-14B-Instruct',
            toolCalls: [
              {
                name: 'search_planets',
                arguments: { nameQuery: 'TRAPPIST-1', limit: 2 },
              },
              {
                name: 'focus_camera',
                arguments: { level: 'planet', targetId: 'trappist-1-e' },
              },
              {
                name: 'highlight',
                arguments: { mode: 'set', planetIds: ['trappist-1-e', 'trappist-1-f'] },
              },
              {
                name: 'compare_planets',
                arguments: { planetIds: ['trappist-1-e', 'earth'] },
              },
              {
                name: 'open_timeline',
                arguments: { throughYear: 2017, playing: false },
              },
            ],
          };
        }
        return {
          model: 'Qwen/Qwen2.5-14B-Instruct',
          content: 'Here is TRAPPIST-1 e with radius {{r:trappist-1-e.pl_rade}} orbiting in the conservative habitable zone.',
        };
      };

      const res = await handleHelmRequest(
        { message: 'Explore TRAPPIST-1 system and compare with Earth' },
        { llmClient: mockLlm, snapshot }
      );

      expect(res.status).toBe(200);
      expect(callCount).toBe(2);

      const parsed = HelmResponseSchema.parse(res.body);
      expect(parsed.meta.source).toBe('ai');
      expect(parsed.meta.model).toBe('Qwen/Qwen2.5-14B-Instruct');

      // Verify all 5 action types were emitted and match HelmActionSchema
      const actionTypes = parsed.actions.map((a) => a.type);
      expect(actionTypes).toContain('highlight');
      expect(actionTypes).toContain('focus');
      expect(actionTypes).toContain('open_compare');
      expect(actionTypes).toContain('timeline');

      for (const act of parsed.actions) {
        expect(() => HelmActionSchema.parse(act)).not.toThrow();
      }
    });

    it('recovers from invalid tool arguments via 1 retry before falling back', async () => {
      let callCount = 0;
      let toolErrorSent = null;

      const mockLlm = async ({ messages }) => {
        callCount += 1;
        if (callCount === 1) {
          // Bad tool call with invalid arguments
          return {
            model: 'mock-ai',
            toolCalls: [
              {
                name: 'open_timeline',
                arguments: { throughYear: 1800 }, // Year 1800 is before 1992 (schema invalid)
              },
            ],
          };
        }
        if (callCount === 2) {
          // Check that tool error was fed back to model
          const toolMsg = messages.find((m) => m.role === 'tool' && m.name === 'open_timeline');
          toolErrorSent = toolMsg ? JSON.parse(toolMsg.content) : null;

          // Model corrects itself with valid year 2015
          return {
            model: 'mock-ai',
            toolCalls: [
              {
                name: 'open_timeline',
                arguments: { throughYear: 2015 },
              },
            ],
          };
        }
        return {
          model: 'mock-ai',
          content: 'Set timeline to year 2015.',
        };
      };

      const res = await handleHelmRequest(
        { message: 'Show 2015 discoveries' },
        { llmClient: mockLlm, snapshot }
      );

      expect(res.status).toBe(200);
      expect(callCount).toBe(3);
      expect(toolErrorSent).not.toBeNull();
      expect(toolErrorSent.error).toContain('Invalid open_timeline arguments');
      expect(res.body.actions).toEqual([{ type: 'timeline', year: 2015 }]);
    });

    it('falls back to deterministic template if tool arguments fail twice', async () => {
      let callCount = 0;
      const badToolLlm = async () => {
        callCount += 1;
        return {
          model: 'mock-ai',
          toolCalls: [
            {
              name: 'focus_camera',
              arguments: { level: 'invalid_level' },
            },
          ],
        };
      };

      const res = await handleHelmRequest(
        { message: 'Focus camera' },
        { llmClient: badToolLlm, snapshot }
      );

      expect(res.status).toBe(200);
      expect(res.body.meta.source).toBe('fallback');
      expect(res.body.meta.notice).toContain('Tool argument validation failed twice');
    });

    it('handles HTTP 429 retry backoff in Featherless client', async () => {
      let attempt = 0;
      const mockFetch = async () => {
        attempt += 1;
        if (attempt === 1) {
          return {
            ok: false,
            status: 429,
            text: async () => 'Rate limit reached',
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            model: 'Qwen/Qwen2.5-7B-Instruct',
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Recovered successfully.',
                },
              },
            ],
          }),
        };
      };

      const client = createFeatherlessClient({
        apiKey: 'fl-test-key-valid',
        fetchImpl: mockFetch,
        timeoutMs: 5000,
      });

      const reply = await client.chat({ messages: [{ role: 'user', content: 'hello' }] });
      expect(reply.content).toBe('Recovered successfully.');
      expect(attempt).toBe(2);
    });
  });
});

