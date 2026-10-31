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
 *   - Never opens or reads .env.local from disk in code; uses process.env.FEATHERLESS_API_KEY only.
 *   - Never reads FEATHERLESS_API_KEY during --dry-run or --verify-guards or before resolveConfig succeeds.
 *   - Pins requests strictly to https://api.featherless.ai/v1 and blocks all HTTP redirects (redirect: 'error').
 *   - Never prints, logs, or echoes FEATHERLESS_API_KEY, Authorization headers, or raw error bodies.
 *   - Smoke mode enforces:
 *       * Exactly 2 distinct approved models: Qwen/Qwen3-14B and Qwen/Qwen3-8B
 *       * Exactly 1 prompt and 1 repeat
 *       * Hard cap of 2 sequential completion requests total (no /v1/models call, no retries, no fallbacks)
 *       * Tool arguments validated against shared/schemas.js (ToolArgumentSchemasByName)
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolArgumentSchemasByName } from '../shared/schemas.js';

export const OFFICIAL_FEATHERLESS_BASE_URL = 'https://api.featherless.ai/v1';
export const APPROVED_SMOKE_MODELS = Object.freeze(['Qwen/Qwen3-14B', 'Qwen/Qwen3-8B']);
export const HARD_SMOKE_MAX_REQUESTS = 2;
export const ALLOWED_CLI_FLAGS = Object.freeze([
  '--smoke',
  '--full',
  '--dry-run',
  '--verify-guards',
]);

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
 * Validates that the base URL points strictly to the official Featherless v1 endpoint
 * with HTTPS, no custom port, no credentials, no query string, and no hash.
 */
export function validateFeatherlessBaseUrl(rawUrl) {
  const PIN_ERROR =
    'Untrusted or invalid FEATHERLESS_BASE_URL: requests are pinned strictly to https://api.featherless.ai/v1';
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error(PIN_ERROR);
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    throw new Error(PIN_ERROR);
  }

  const normalizedPathname = parsedUrl.pathname.replace(/\/+$/, '');
  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname !== 'api.featherless.ai' ||
    parsedUrl.port !== '' ||
    parsedUrl.username !== '' ||
    parsedUrl.password !== '' ||
    normalizedPathname !== '/v1' ||
    parsedUrl.search !== '' ||
    parsedUrl.hash !== ''
  ) {
    throw new Error(PIN_ERROR);
  }

  const normalized = `${parsedUrl.protocol}//${parsedUrl.hostname}${normalizedPathname}`;
  if (normalized !== OFFICIAL_FEATHERLESS_BASE_URL) {
    throw new Error(PIN_ERROR);
  }
  return OFFICIAL_FEATHERLESS_BASE_URL;
}

/**
 * Resolves and validates the run configuration without touching credentials or network.
 */
export function resolveConfig(env = process.env, argv = process.argv.slice(2)) {
  if (!Array.isArray(argv)) {
    throw new Error('Invalid CLI arguments array');
  }

  for (const arg of argv) {
    if (typeof arg !== 'string' || !ALLOWED_CLI_FLAGS.includes(arg)) {
      throw new Error(`Unknown or unsupported CLI argument: "${String(arg)}"`);
    }
  }

  const hasSmokeFlag = argv.includes('--smoke');
  const hasFullFlag = argv.includes('--full');
  if (hasSmokeFlag && hasFullFlag) {
    throw new Error('Conflicting mode flags: --smoke and --full cannot be combined');
  }

  const rawEnvMode = env.BAKEOFF_MODE !== undefined ? String(env.BAKEOFF_MODE).trim() : '';
  if (rawEnvMode !== '' && rawEnvMode !== 'smoke' && rawEnvMode !== 'full') {
    throw new Error(`Invalid BAKEOFF_MODE: must be "smoke" or "full", got "${rawEnvMode}"`);
  }

  if (hasSmokeFlag && rawEnvMode === 'full') {
    throw new Error('Conflicting mode configuration: --smoke cannot be combined with BAKEOFF_MODE=full');
  }
  if (hasFullFlag && rawEnvMode === 'smoke') {
    throw new Error('Conflicting mode configuration: --full cannot be combined with BAKEOFF_MODE=smoke');
  }
  if (!hasFullFlag && rawEnvMode === 'full') {
    throw new Error(
      'Conflicting mode configuration: BAKEOFF_MODE=full requires explicit --full CLI flag and cannot override default/smoke mode'
    );
  }

  const isDryRun = argv.includes('--dry-run') || env.BAKEOFF_DRY_RUN === '1';
  const isVerifyGuards = argv.includes('--verify-guards');
  const isFullMode = hasFullFlag;
  const isSmokeMode = !isFullMode; // Default to strict smoke-test mode for safety

  const rawBaseUrl =
    env.FEATHERLESS_BASE_URL !== undefined ? env.FEATHERLESS_BASE_URL : OFFICIAL_FEATHERLESS_BASE_URL;
  const baseUrl = validateFeatherlessBaseUrl(rawBaseUrl);

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
 * Loads FEATHERLESS_API_KEY strictly from the provided environment object (defaults to process.env).
 * Never opens or reads .env.local from disk. Never called in dry-run or guard tests.
 */
export function loadLiveApiKey(env = process.env) {
  const key = typeof env?.FEATHERLESS_API_KEY === 'string' ? env.FEATHERLESS_API_KEY.trim() : '';
  if (!key) {
    throw new Error(
      'Missing FEATHERLESS_API_KEY in process environment. Run with node --env-file=.env.local scripts/bakeoff-models.js --smoke'
    );
  }
  return key;
}

/**
 * Validates tool calls against the runtime Zod schemas in shared/schemas.js.
 */
export function validateToolCalls(toolCalls, expectedTools = []) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return { valid: false, correct: false, names: [], errors: ['No tool_calls present'] };
  }
  const names = [];
  for (const tc of toolCalls) {
    if (tc?.type !== undefined && tc.type !== 'function') {
      return {
        valid: false,
        correct: false,
        names,
        errors: [`Unsupported tool_call type: ${String(tc?.type)}`],
      };
    }
    const fnName = tc?.function?.name;
    const rawArgs = tc?.function?.arguments;
    if (typeof fnName !== 'string' || !fnName || typeof rawArgs !== 'string') {
      return {
        valid: false,
        correct: false,
        names,
        errors: ['Missing function.name or non-string function.arguments'],
      };
    }
    const schema = Object.prototype.hasOwnProperty.call(ToolArgumentSchemasByName, fnName)
      ? ToolArgumentSchemasByName[fnName]
      : null;
    if (!schema) {
      return {
        valid: false,
        correct: false,
        names,
        errors: [`Unknown tool name: ${fnName}`],
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(rawArgs);
    } catch {
      return {
        valid: false,
        correct: false,
        names,
        errors: [`Invalid JSON arguments for ${fnName}`],
      };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        valid: false,
        correct: false,
        names,
        errors: [`Arguments for ${fnName} must be a JSON object`],
      };
    }

    const validation = schema.safeParse(parsed);
    if (!validation.success) {
      return {
        valid: false,
        correct: false,
        names,
        errors: validation.error.issues.map(
          (issue) => `${fnName}.${issue.path.join('.') || '<root>'}: ${issue.message}`
        ),
      };
    }

    names.push(fnName);
  }

  const correct =
    Array.isArray(expectedTools) &&
    expectedTools.length > 0 &&
    expectedTools.every((exp) => names.includes(exp));
  return { valid: true, correct, names, errors: [] };
}

/**
 * Redacts any accidental occurrence of the API key from an error message.
 */
export function sanitizeErrorMessage(err, env = process.env) {
  let msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const rawKey = typeof env?.FEATHERLESS_API_KEY === 'string' ? env.FEATHERLESS_API_KEY.trim() : '';
  if (rawKey && msg.includes(rawKey)) {
    msg = msg.split(rawKey).join('[REDACTED]');
  }
  return msg;
}

/**
 * Executes a configured run using an injectable transport (defaults to global fetch).
 * Enforces a hard request budget with zero retries and zero fallbacks.
 */
export async function executeBakeoff(config, { apiKey, fetchImpl = globalThis.fetch } = {}) {
  const validatedBaseUrl = validateFeatherlessBaseUrl(config?.baseUrl);

  if (config.isDryRun) {
    return {
      dryRun: true,
      mode: config.mode,
      baseUrl: validatedBaseUrl,
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

  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
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
      const res = await fetchImpl(`${validatedBaseUrl}/chat/completions`, {
        method: 'POST',
        redirect: 'error',
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

      // Reject any redirect immediately without reading body or following
      if (
        res.redirected === true ||
        (typeof res.status === 'number' && res.status >= 300 && res.status < 400)
      ) {
        return {
          ok: false,
          status: typeof res.status === 'number' && res.status >= 300 && res.status < 400 ? res.status : 'REDIRECT_BLOCKED',
          elapsedMs,
          valid: false,
          correct: false,
          calledTools: [],
          hasThink: false,
        };
      }

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
    assert.equal(defaultCfg.baseUrl, OFFICIAL_FEATHERLESS_BASE_URL);
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

    // 3. Rejects mode conflicts and unknown CLI flags before any request or key load
    assert.throws(
      () => resolveConfig({ BAKEOFF_MODE: 'full' }, ['--smoke']),
      /Conflicting mode configuration: --smoke cannot be combined with BAKEOFF_MODE=full/
    );
    assert.throws(
      () => resolveConfig({ BAKEOFF_MODE: 'full' }, []),
      /Conflicting mode configuration: BAKEOFF_MODE=full requires explicit --full CLI flag/
    );
    assert.throws(
      () => resolveConfig({ BAKEOFF_MODE: 'smoke' }, ['--full']),
      /Conflicting mode configuration: --full cannot be combined with BAKEOFF_MODE=smoke/
    );
    assert.throws(
      () => resolveConfig({}, ['--smoke', '--full']),
      /Conflicting mode flags: --smoke and --full cannot be combined/
    );
    assert.throws(
      () => resolveConfig({ BAKEOFF_MODE: 'turbo' }, ['--smoke']),
      /Invalid BAKEOFF_MODE/
    );
    for (const badArg of ['--smok', '--foo', 'smoke', '--url=https://evil.example.com']) {
      assert.throws(
        () => resolveConfig({}, [badArg]),
        /Unknown or unsupported CLI argument/
      );
    }

    // 4. Rejects non-official FEATHERLESS_BASE_URL before loading key
    for (const badUrl of [
      'https://evil.example.com/v1',
      'http://api.featherless.ai/v1',
      'https://api.featherless.ai:8443/v1',
      'https://user:pass@api.featherless.ai/v1',
      'https://api.featherless.ai/v2',
      'https://api.featherless.ai/v1/extra',
      'https://api.featherless.ai/v1?foo=bar',
      'https://api.featherless.ai/v1#frag',
    ]) {
      assert.throws(
        () => resolveConfig({ FEATHERLESS_BASE_URL: badUrl }, ['--smoke']),
        /Untrusted or invalid FEATHERLESS_BASE_URL/
      );
    }

    // 5. Rejects non-positive or malformed integer inputs
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

    // 6. Rejects smoke-mode prompt or repeat count > 1
    assert.throws(
      () => resolveConfig({ BAKEOFF_REPEATS: '2' }, []),
      /Smoke-test mode requires exactly 1 repeat/
    );
    assert.throws(
      () => resolveConfig({ BAKEOFF_MAX_PROMPTS: '2' }, []),
      /Smoke-test mode requires exactly 1 prompt/
    );

    // 7. Rejects duplicate, single, >2, or unapproved models in smoke mode
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

    // 8. Process environment key loading only (never touches disk)
    assert.throws(
      () => loadLiveApiKey({}),
      /Missing FEATHERLESS_API_KEY in process environment/
    );
    assert.equal(loadLiveApiKey({ FEATHERLESS_API_KEY: '  mock_env_key  ' }), 'mock_env_key');

    // 9. Zod tool argument schema validation checks
    assert.equal(
      validateToolCalls(
        [
          {
            type: 'function',
            function: {
              name: 'search_planets',
              arguments: JSON.stringify({ radiusEarth: { min: 0.8, max: 1.6 }, hz: 'in_optimistic', limit: 5 }),
            },
          },
        ],
        ['search_planets']
      ).valid,
      true
    );
    for (const invalidCall of [
      { name: 'search_planets', args: { limit: '5' } },
      { name: 'search_planets', args: { limit: 99 } },
      { name: 'search_planets', args: { radiusEarth: { min: 2.0, max: 1.0 } } },
      { name: 'search_planets', args: { hz: 'in_optimistic', extraField: true } },
      { name: 'compare_planets', args: { planetIds: ['earth'] } },
      { name: 'focus_camera', args: { level: 'planet' } },
      { name: 'highlight', args: { mode: 'set', planetIds: [] } },
      { name: 'open_timeline', args: { throughYear: 1800 } },
      { name: 'invent_planets', args: {} },
    ]) {
      const check = validateToolCalls(
        [{ type: 'function', function: { name: invalidCall.name, arguments: JSON.stringify(invalidCall.args) } }],
        [invalidCall.name]
      );
      assert.equal(check.valid, false, `Expected invalid tool call ${invalidCall.name} to fail Zod validation`);
      assert.equal(check.correct, false);
    }

    // 10. Mock smoke execution: 2 calls, redirect: 'error' passed, 302/429 rejected without reading body
    const liveSmokeCfg = resolveConfig({}, ['--smoke']);
    let mockCalls = 0;
    let errorBodyRead = false;
    const seenRedirectModes = [];
    const mockFetch = async (url, init) => {
      mockCalls += 1;
      assert.equal(url, `${OFFICIAL_FEATHERLESS_BASE_URL}/chat/completions`);
      seenRedirectModes.push(init.redirect);
      const body = JSON.parse(init.body);
      if (body.model === 'Qwen/Qwen3-14B') {
        return {
          ok: true,
          status: 200,
          redirected: false,
          json: async () => ({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      type: 'function',
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
      // Second model simulates a 302 redirect response to verify redirects are never followed or read
      return {
        ok: false,
        status: 302,
        redirected: true,
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
    assert.equal(mockCalls, 2, 'Smoke test must make exactly 2 calls with 0 retries');
    assert.deepEqual(seenRedirectModes, ['error', 'error']);
    assert.equal(mockRes.requestsMade, 2);
    assert.equal(errorBodyRead, false, 'Redirect/error response body must never be read');
    assert.equal(mockRes.summary[0].runs[0].valid, true);
    assert.equal(mockRes.summary[0].runs[0].correct, true);
    assert.equal(mockRes.summary[1].runs[0].status, 302);
    assert.equal(mockRes.summary[1].runs[0].valid, false);

    // 11. Hard cap guard blocks any call beyond maxRequests
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
      checksPassed: 11,
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
  const config = resolveConfig(process.env, argv);

  if (config.isVerifyGuards) {
    const report = await runGuardChecks();
    console.log('Guard & mock verification passed:', JSON.stringify(report, null, 2));
    return;
  }

  if (config.isDryRun) {
    const report = await executeBakeoff(config);
    console.log('Dry run succeeded (no network, no credentials, no file writes):');
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Live execution path (only reached when resolveConfig succeeds and neither --dry-run nor --verify-guards is passed)
  const apiKey = loadLiveApiKey(process.env);
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
    console.error('Bake-off error:', sanitizeErrorMessage(err, process.env));
    process.exitCode = 1;
  });
}
