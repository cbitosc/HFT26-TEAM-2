/**
 * scripts/bakeoff-models.js
 * Phase 0 Featherless LLM tool-calling smoke-test & bake-off script.
 *
 * Modes:
 *   1. Dry run (no network, no credentials loaded, no files written):
 *        node scripts/bakeoff-models.js --dry-run
 *   2. Guard & mock verification (no network, no credentials loaded, no files written):
 *        node scripts/bakeoff-models.js --verify-guards
 *   3. Strict 2-request live smoke test (requires human authorization):
 *        node --env-file=.env.local scripts/bakeoff-models.js --smoke
 *   4. Full bake-off (5 prompts x 3 repeats; requires human authorization):
 *        node --env-file=.env.local scripts/bakeoff-models.js --full
 *
 * Security & Safety:
 *   - Never loads .env.local or reads FEATHERLESS_API_KEY during --dry-run or --verify-guards.
 *   - Never prints, logs, or echoes FEATHERLESS_API_KEY, Authorization headers, or raw error bodies.
 *   - Smoke mode enforces:
 *       * Exactly 2 distinct approved models: Qwen/Qwen3-14B and Qwen/Qwen3-8B
 *       * Exactly 1 prompt and 1 repeat
 *       * Hard cap of 2 completion requests total (no /v1/models call, no retries, no fallbacks)
 *       * No report file written unless explicitly requested in full mode
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROBES_DIR = path.join(ROOT, 'docs', 'probes');

export const APPROVED_SMOKE_MODELS = Object.freeze(['Qwen/Qwen3-14B', 'Qwen/Qwen3-8B']);
export const HARD_SMOKE_MAX_REQUESTS = 2;

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_planets',
      description: 'Search confirmed exoplanets using typed filters.',
      parameters: {
        type: 'object',
        properties: {
          nameQuery: { type: 'string' },
          radiusEarth: {
            type: 'object',
            properties: { min: { type: 'number' }, max: { type: 'number' } },
          },
          hz: { type: 'string', enum: ['in_conservative', 'in_optimistic'] },
          contestedOnly: { type: 'boolean' },
          sortBy: {
            type: 'string',
            enum: ['distance', 'radius', 'mass', 'eqTemp', 'discYear', 'nSolutions'],
          },
          sortDir: { type: 'string', enum: ['asc', 'desc'] },
          limit: { type: 'integer', minimum: 1, maximum: 10 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_planet',
      description: 'Get detailed fields, habitability indicators, and dispute summary for one planet.',
      parameters: {
        type: 'object',
        properties: { planetId: { type: 'string' } },
        required: ['planetId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_planets',
      description: 'Compare 2 to 3 planets (or earth / jupiter reference) side by side.',
      parameters: {
        type: 'object',
        properties: {
          planetIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 3,
          },
        },
        required: ['planetIds'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'focus_camera',
      description: 'Move the 3D camera to galaxy, a star system, or a planet.',
      parameters: {
        type: 'object',
        properties: {
          targetId: { type: 'string' },
          level: { type: 'string', enum: ['galaxy', 'system', 'planet'] },
        },
        required: ['level'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'highlight',
      description: 'Highlight a set of planets in the 3D scene.',
      parameters: {
        type: 'object',
        properties: {
          planetIds: { type: 'array', items: { type: 'string' } },
          mode: { type: 'string', enum: ['set', 'clear'] },
        },
        required: ['mode'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_timeline',
      description: 'Set the discovery timeline scrubber to a specific year.',
      parameters: {
        type: 'object',
        properties: {
          throughYear: { type: 'integer', minimum: 1992, maximum: 2026 },
          playing: { type: 'boolean' },
        },
        required: ['throughYear'],
        additionalProperties: false,
      },
    },
  },
];

const SYSTEM_PROMPT = [
  'You are HELM, an AI astronomer operating the Team Tetris Exoplanet Explorer through tools.',
  'Always call the appropriate tool(s) first to answer questions or control the 3D view.',
  'Never invent numbers; never claim a planet is habitable or uninhabitable.',
  'Do not emit <think> blocks.',
].join(' ');

export const CANNED_PROMPTS = [
  {
    id: 1,
    prompt: "Which planets are about Earth's size and sit in the habitable zone?",
    expectedTools: ['search_planets'],
  },
  {
    id: 2,
    prompt: 'Which planets have the most disputed measurements?',
    expectedTools: ['search_planets'],
  },
  {
    id: 3,
    prompt: 'Compare TRAPPIST-1 e with Earth.',
    expectedTools: ['compare_planets'],
  },
  {
    id: 4,
    prompt: 'Show discoveries through 2015.',
    expectedTools: ['open_timeline'],
  },
  {
    id: 5,
    prompt: 'Fly me to the nearest known exoplanet.',
    expectedTools: ['search_planets', 'focus_camera'],
  },
];

/**
 * Strictly validates that a value is a positive integer (>= 1).
 * Rejects 0, negative numbers, decimals, NaN, empty strings, or non-numeric strings.
 */
export function parsePositiveInt(rawValue, fieldName) {
  const str = String(rawValue ?? '').trim();
  if (!/^[1-9]\d*$/.test(str)) {
    throw new Error(`Invalid ${fieldName}: must be a positive integer (>= 1), got "${str}"`);
  }
  const num = Number(str);
  if (!Number.isSafeInteger(num) || num < 1) {
    throw new Error(`Invalid ${fieldName}: out of safe positive integer range`);
  }
  return num;
}

/**
 * Resolves and validates the run configuration without touching credentials or network.
 */
export function resolveConfig(env = process.env, argv = process.argv.slice(2)) {
  const isDryRun = argv.includes('--dry-run') || env.BAKEOFF_DRY_RUN === '1';
  const isVerifyGuards = argv.includes('--verify-guards');
  const isFullMode = argv.includes('--full') || env.BAKEOFF_MODE === 'full';
  const isSmokeMode = !isFullMode; // Default to strict smoke-test mode for safety

  const baseUrl = (env.FEATHERLESS_BASE_URL || 'https://api.featherless.ai/v1').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+(\/[a-z0-9._/-]*)?$/i.test(baseUrl)) {
    throw new Error('Invalid FEATHERLESS_BASE_URL: must be a valid HTTPS URL');
  }

  const rawModels = env.BAKEOFF_MODELS
    ? env.BAKEOFF_MODELS.split(',').map((s) => s.trim()).filter(Boolean)
    : [...APPROVED_SMOKE_MODELS];

  const uniqueModels = new Set(rawModels);
  if (uniqueModels.size !== rawModels.length) {
    throw new Error('Invalid BAKEOFF_MODELS: duplicate model IDs are not allowed');
  }

  if (isSmokeMode) {
    if (rawModels.length !== 2) {
      throw new Error(
        `Invalid smoke-test models: expected exactly 2 distinct models (${APPROVED_SMOKE_MODELS.join(', ')}), got ${rawModels.length}`
      );
    }
    for (const m of rawModels) {
      if (!APPROVED_SMOKE_MODELS.includes(m)) {
        throw new Error(
          `Unapproved model "${m}" for smoke test. Allowed models: ${APPROVED_SMOKE_MODELS.join(', ')}`
        );
      }
    }

    const repeats = env.BAKEOFF_REPEATS !== undefined
      ? parsePositiveInt(env.BAKEOFF_REPEATS, 'BAKEOFF_REPEATS')
      : 1;
    const maxPrompts = env.BAKEOFF_MAX_PROMPTS !== undefined
      ? parsePositiveInt(env.BAKEOFF_MAX_PROMPTS, 'BAKEOFF_MAX_PROMPTS')
      : 1;

    if (repeats !== 1) {
      throw new Error(`Smoke-test mode requires exactly 1 repeat (got ${repeats})`);
    }
    if (maxPrompts !== 1) {
      throw new Error(`Smoke-test mode requires exactly 1 prompt (got ${maxPrompts})`);
    }

    const prompts = CANNED_PROMPTS.slice(0, 1);
    const plannedRequests = rawModels.length * prompts.length * repeats;
    if (plannedRequests > HARD_SMOKE_MAX_REQUESTS) {
      throw new Error(`Planned requests (${plannedRequests}) exceed hard smoke limit (${HARD_SMOKE_MAX_REQUESTS})`);
    }

    return {
      mode: 'smoke',
      isDryRun,
      isVerifyGuards,
      baseUrl,
      models: rawModels,
      prompts,
      repeats: 1,
      maxRequests: HARD_SMOKE_MAX_REQUESTS,
      plannedRequests,
      writeReport: false,
    };
  }

  // Full bake-off mode validation
  if (rawModels.length < 1 || rawModels.length > 4) {
    throw new Error(`Invalid BAKEOFF_MODELS count for full mode: ${rawModels.length}`);
  }
  const repeats = env.BAKEOFF_REPEATS !== undefined
    ? parsePositiveInt(env.BAKEOFF_REPEATS, 'BAKEOFF_REPEATS')
    : 3;
  const maxPrompts = env.BAKEOFF_MAX_PROMPTS !== undefined
    ? parsePositiveInt(env.BAKEOFF_MAX_PROMPTS, 'BAKEOFF_MAX_PROMPTS')
    : CANNED_PROMPTS.length;

  if (maxPrompts > CANNED_PROMPTS.length) {
    throw new Error(`BAKEOFF_MAX_PROMPTS (${maxPrompts}) exceeds available prompts (${CANNED_PROMPTS.length})`);
  }
  if (repeats > 5) {
    throw new Error(`BAKEOFF_REPEATS (${repeats}) exceeds maximum allowed repeats (5)`);
  }

  const prompts = CANNED_PROMPTS.slice(0, maxPrompts);
  const plannedRequests = rawModels.length * prompts.length * repeats;

  return {
    mode: 'full',
    isDryRun,
    isVerifyGuards,
    baseUrl,
    models: rawModels,
    prompts,
    repeats,
    maxRequests: plannedRequests,
    plannedRequests,
    writeReport: !isDryRun && env.BAKEOFF_WRITE_REPORT !== '0',
  };
}

/**
 * Loads FEATHERLESS_API_KEY only for live execution. Never called in dry-run or guard tests.
 */
function loadLiveApiKey() {
  if (process.env.FEATHERLESS_API_KEY) {
    return process.env.FEATHERLESS_API_KEY;
  }
  const envLocalPath = path.join(ROOT, '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const lines = fs.readFileSync(envLocalPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (k === 'FEATHERLESS_API_KEY' && v) {
          return v;
        }
      }
    }
  }
  throw new Error('Missing FEATHERLESS_API_KEY for live run.');
}

export function validateToolCalls(toolCalls, expectedTools) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return { valid: false, correct: false, names: [] };
  }
  const names = [];
  for (const tc of toolCalls) {
    const fnName = tc?.function?.name;
    const rawArgs = tc?.function?.arguments;
    if (!fnName || typeof rawArgs !== 'string') {
      return { valid: false, correct: false, names };
    }
    try {
      const parsed = JSON.parse(rawArgs);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { valid: false, correct: false, names };
      }
      names.push(fnName);
    } catch {
      return { valid: false, correct: false, names };
    }
  }
  const correct = expectedTools.some((exp) => names.includes(exp));
  return { valid: true, correct, names };
}

/**
 * Executes a configured run using an injectable transport (defaults to global fetch).
 * Enforces a hard request budget with zero retries and zero fallbacks.
 */
export async function executeBakeoff(config, { apiKey, fetchImpl = globalThis.fetch } = {}) {
  if (config.isDryRun) {
    return {
      dryRun: true,
      mode: config.mode,
      models: config.models,
      promptCount: config.prompts.length,
      repeats: config.repeats,
      plannedRequests: config.plannedRequests,
      maxRequests: config.maxRequests,
      requestsMade: 0,
      credentialsLoaded: false,
      reportWritten: false,
    };
  }

  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Live execution requires a non-empty apiKey');
  }

  let requestsMade = 0;
  const summary = [];

  async function callSingleCompletion(model, promptItem) {
    if (requestsMade >= config.maxRequests) {
      throw new Error(`Hard request budget exceeded (max ${config.maxRequests})`);
    }
    requestsMade += 1;

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: promptItem.prompt },
          ],
          tools: TOOLS,
          tool_choice: 'auto',
          temperature: 0.1,
          max_tokens: 300,
        }),
        signal: controller.signal,
      });
      const elapsedMs = Date.now() - started;

      // Never read or print raw error response bodies
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          elapsedMs,
          valid: false,
          correct: false,
          calledTools: [],
          hasThink: false,
        };
      }

      const json = await res.json();
      const msg = json?.choices?.[0]?.message || {};
      const content = typeof msg.content === 'string' ? msg.content : '';
      const hasThink = /<think>/i.test(content);
      const check = validateToolCalls(msg.tool_calls, promptItem.expectedTools);
      return {
        ok: true,
        status: res.status,
        elapsedMs,
        valid: check.valid,
        correct: check.correct,
        calledTools: check.names,
        hasThink,
      };
    } catch (err) {
      return {
        ok: false,
        status: err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        elapsedMs: Date.now() - started,
        valid: false,
        correct: false,
        calledTools: [],
        hasThink: false,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  for (const model of config.models) {
    let totalRuns = 0;
    let validCalls = 0;
    let correctCalls = 0;
    let thinkLeaks = 0;
    const latencies = [];
    const runs = [];

    for (const item of config.prompts) {
      for (let r = 0; r < config.repeats; r++) {
        totalRuns += 1;
        const result = await callSingleCompletion(model, item);
        latencies.push(result.elapsedMs);
        if (result.ok) {
          if (result.hasThink) thinkLeaks += 1;
          if (result.valid) validCalls += 1;
          if (result.correct) correctCalls += 1;
        }
        runs.push({
          promptId: item.id,
          repeat: r + 1,
          status: result.status,
          ok: result.ok,
          valid: result.valid,
          correct: result.correct,
          calledTools: result.calledTools,
          hasThink: result.hasThink,
          elapsedMs: result.elapsedMs,
        });
      }
    }

    const avgMs = Math.round(latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length));
    summary.push({
      model,
      totalRuns,
      validRate: Number(((validCalls / totalRuns) * 100).toFixed(1)),
      correctRate: Number(((correctCalls / totalRuns) * 100).toFixed(1)),
      thinkLeakRate: Number(((thinkLeaks / totalRuns) * 100).toFixed(1)),
      avgMs,
      runs,
    });
  }

  return {
    dryRun: false,
    mode: config.mode,
    requestsMade,
    maxRequests: config.maxRequests,
    reportWritten: false,
    summary,
  };
}

/**
 * Runs offline guard and mock verification checks.
 * Guarantees 0 network calls, 0 credential loads, and 0 file writes.
 */
export async function runGuardChecks() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('FORBIDDEN_NETWORK_CALL_DURING_GUARD_CHECKS');
  };

  try {
    // 1. Default smoke-mode config check
    const defaultCfg = resolveConfig({}, ['--dry-run']);
    assert.equal(defaultCfg.mode, 'smoke');
    assert.equal(defaultCfg.isDryRun, true);
    assert.deepEqual(defaultCfg.models, ['Qwen/Qwen3-14B', 'Qwen/Qwen3-8B']);
    assert.equal(defaultCfg.prompts.length, 1);
    assert.equal(defaultCfg.repeats, 1);
    assert.equal(defaultCfg.plannedRequests, 2);
    assert.equal(defaultCfg.maxRequests, 2);
    assert.equal(defaultCfg.writeReport, false);

    // 2. Dry-run execution makes 0 requests, loads no credentials, writes no report
    const dryRes = await executeBakeoff(defaultCfg);
    assert.equal(dryRes.dryRun, true);
    assert.equal(dryRes.requestsMade, 0);
    assert.equal(dryRes.credentialsLoaded, false);
    assert.equal(dryRes.reportWritten, false);

    // 3. Rejects non-positive or malformed integer inputs
    for (const badVal of ['0', '-1', '1.5', 'abc', '', 'NaN', 'Infinity']) {
      assert.throws(
        () => resolveConfig({ BAKEOFF_REPEATS: badVal }, []),
        /Invalid BAKEOFF_REPEATS/,
        `Expected BAKEOFF_REPEATS="${badVal}" to be rejected`
      );
      assert.throws(
        () => resolveConfig({ BAKEOFF_MAX_PROMPTS: badVal }, []),
        /Invalid BAKEOFF_MAX_PROMPTS/,
        `Expected BAKEOFF_MAX_PROMPTS="${badVal}" to be rejected`
      );
    }

    // 4. Rejects smoke-mode prompt or repeat count > 1
    assert.throws(
      () => resolveConfig({ BAKEOFF_REPEATS: '2' }, []),
      /Smoke-test mode requires exactly 1 repeat/
    );
    assert.throws(
      () => resolveConfig({ BAKEOFF_MAX_PROMPTS: '2' }, []),
      /Smoke-test mode requires exactly 1 prompt/
    );

    // 5. Rejects duplicate, single, >2, or unapproved models in smoke mode
    assert.throws(
      () => resolveConfig({ BAKEOFF_MODELS: 'Qwen/Qwen3-14B,Qwen/Qwen3-14B' }, []),
      /duplicate model IDs/
    );
    assert.throws(
      () => resolveConfig({ BAKEOFF_MODELS: 'Qwen/Qwen3-14B' }, []),
      /expected exactly 2 distinct models/
    );
    assert.throws(
      () => resolveConfig({ BAKEOFF_MODELS: 'Qwen/Qwen3-14B,Qwen/Qwen3-8B,Qwen/Qwen3-32B' }, []),
      /expected exactly 2 distinct models/
    );
    assert.throws(
      () => resolveConfig({ BAKEOFF_MODELS: 'Qwen/Qwen3-14B,Qwen/Qwen3-32B' }, []),
      /Unapproved model/
    );

    // 6. Mock smoke execution: exactly 2 calls, validates structured tool calls, no retry on error, no error body read
    const liveSmokeCfg = resolveConfig({}, []);
    let mockCalls = 0;
    let errorBodyRead = false;
    const mockFetch = async (_url, init) => {
      mockCalls += 1;
      const body = JSON.parse(init.body);
      if (body.model === 'Qwen/Qwen3-14B') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      function: {
                        name: 'search_planets',
                        arguments: JSON.stringify({
                          radiusEarth: { min: 0.8, max: 1.6 },
                          hz: 'in_optimistic',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }
      // Second model simulates a 429 error to verify zero retries and that error body is never read
      return {
        ok: false,
        status: 429,
        text: async () => {
          errorBodyRead = true;
          return 'SENSITIVE_UPSTREAM_BODY_DO_NOT_READ';
        },
        json: async () => {
          errorBodyRead = true;
          return { error: 'SENSITIVE_UPSTREAM_BODY_DO_NOT_READ' };
        },
      };
    };

    const mockRes = await executeBakeoff(liveSmokeCfg, {
      apiKey: 'MOCK_KEY_NOT_REAL',
      fetchImpl: mockFetch,
    });
    assert.equal(mockCalls, 2, 'Smoke test must make exactly 2 calls with 0 retries on 429');
    assert.equal(mockRes.requestsMade, 2);
    assert.equal(errorBodyRead, false, 'Error response body must never be read');
    assert.equal(mockRes.summary[0].runs[0].valid, true);
    assert.equal(mockRes.summary[0].runs[0].correct, true);
    assert.equal(mockRes.summary[1].runs[0].status, 429);
    assert.equal(mockRes.summary[1].runs[0].valid, false);

    // 7. Hard cap guard blocks any call beyond maxRequests
    const tamperedCfg = {
      ...liveSmokeCfg,
      maxRequests: 1, // Force cap of 1 while 2 models are queued
    };
    await assert.rejects(
      () =>
        executeBakeoff(tamperedCfg, {
          apiKey: 'MOCK_KEY_NOT_REAL',
          fetchImpl: mockFetch,
        }),
      /Hard request budget exceeded \(max 1\)/
    );

    return {
      ok: true,
      checksPassed: 7,
      networkRequests: 0,
      credentialsLoaded: false,
      filesWritten: 0,
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--verify-guards')) {
    const report = await runGuardChecks();
    console.log('Guard & mock verification passed:', JSON.stringify(report, null, 2));
    return;
  }

  const config = resolveConfig(process.env, argv);

  if (config.isDryRun) {
    const report = await executeBakeoff(config);
    console.log('Dry run succeeded (no network, no credentials, no file writes):');
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Live execution path (only reached when neither --dry-run nor --verify-guards is passed)
  const apiKey = loadLiveApiKey();
  console.log(
    `Starting live ${config.mode} test: models=${config.models.join(', ')} | prompts=${config.prompts.length} | repeats=${config.repeats} | maxRequests=${config.maxRequests}`
  );
  const result = await executeBakeoff(config, { apiKey });
  for (const s of result.summary) {
    for (const r of s.runs) {
      console.log(
        `Model=${s.model} | status=${r.status} | valid=${r.valid} | correct=${r.correct} | tools=${r.calledTools.join(',') || 'none'} | elapsedMs=${r.elapsedMs}`
      );
    }
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main().catch((err) => {
    console.error('Bake-off error:', err.message);
    process.exitCode = 1;
  });
}
