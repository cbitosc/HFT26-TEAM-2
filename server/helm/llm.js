/**
 * server/helm/llm.js
 * Featherless AI provider client for HELM.
 *
 * Rules (AGENTS.md Section 1, ARCHITECTURE.md Section 8.8 & 10):
 *   - Base URL pinned strictly to https://api.featherless.ai/v1 (redirect: 'error').
 *   - Uses process.env.FEATHERLESS_API_KEY only; never reads .env.local from disk.
 *   - API keys and Authorization headers are NEVER logged, printed, or sent to browser.
 *   - Strips <think>...</think> blocks from responses before validation.
 *   - Handles HTTP 429 with exponential backoff (1s, then 2s; max 2 retries).
 *   - Timeout: 20 seconds per request.
 *   - Supports model fallback via FEATHERLESS_FALLBACK_MODEL.
 */

export const OFFICIAL_FEATHERLESS_BASE_URL = 'https://api.featherless.ai/v1';
export const DEFAULT_FEATHERLESS_MODEL = 'Qwen/Qwen2.5-7B-Instruct';

/**
 * Validates and normalizes the base URL. Rejects non-official hosts, non-https,
 * ports, query strings, and fragments.
 */
export function validateFeatherlessBaseUrl(rawUrl) {
  const PIN_ERROR =
    'Untrusted or invalid FEATHERLESS_BASE_URL: requests are pinned strictly to https://api.featherless.ai/v1';
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error(PIN_ERROR);
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
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
    parsedUrl.search !== '' ||
    parsedUrl.hash !== '' ||
    normalizedPathname !== '/v1'
  ) {
    throw new Error(PIN_ERROR);
  }
  return OFFICIAL_FEATHERLESS_BASE_URL;
}

/**
 * Strips <think>...</think> reasoning blocks from text.
 */
export function stripThinkingBlocks(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * Redacts any accidental appearance of the API key from an error message.
 */
export function sanitizeErrorMessage(err, apiKey = '') {
  let msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  if (apiKey && apiKey.length > 5 && msg.includes(apiKey)) {
    msg = msg.split(apiKey).join('[REDACTED]');
  }
  return msg;
}

/**
 * Creates a Featherless chat client.
 * Returns null if no API key is configured.
 */
export function createFeatherlessClient({
  apiKey = process.env.FEATHERLESS_API_KEY?.trim() || '',
  baseUrl = process.env.FEATHERLESS_BASE_URL || OFFICIAL_FEATHERLESS_BASE_URL,
  model = process.env.FEATHERLESS_MODEL || DEFAULT_FEATHERLESS_MODEL,
  fallbackModel = process.env.FEATHERLESS_FALLBACK_MODEL || null,
  timeoutMs = 20000,
  fetchImpl = typeof fetch === 'function' ? fetch : null,
} = {}) {
  if (!apiKey) {
    return null;
  }

  const validatedBaseUrl = validateFeatherlessBaseUrl(baseUrl);
  const completionsEndpoint = `${validatedBaseUrl}/chat/completions`;

  async function postCompletion(activeModel, messages, tools, retryCount = 0) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const payload = {
      model: activeModel,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined,
      tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
      temperature: 0.1,
      max_tokens: 600,
    };

    try {
      const res = await (fetchImpl || fetch)(completionsEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'ExoplanetExplorer-HELM/1.0',
        },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: controller.signal,
      });

      if (res.status === 429 && retryCount < 2) {
        // Backoff: 1s, then 2s
        const backoffMs = (retryCount + 1) * 1000;
        await new Promise((r) => setTimeout(r, backoffMs));
        return postCompletion(activeModel, messages, tools, retryCount + 1);
      }

      if (!res.ok) {
        let errSnippet = `HTTP ${res.status}`;
        try {
          const errBody = await res.text();
          const clean = sanitizeErrorMessage(errBody.slice(0, 200), apiKey);
          errSnippet += `: ${clean}`;
        } catch {
          // ignore
        }
        const httpErr = new Error(`Featherless API error: ${errSnippet}`);
        httpErr.status = res.status;
        throw httpErr;
      }

      const json = await res.json();
      return json;
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Featherless request timed out after ${timeoutMs}ms.`);
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      err.message = sanitizeErrorMessage(err, apiKey);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    isConfigured: true,
    model,
    fallbackModel,
    chat: async ({ messages, tools = [] }) => {
      let rawResponse;
      let usedModel = model;

      try {
        rawResponse = await postCompletion(model, messages, tools);
      } catch (primaryErr) {
        if (fallbackModel && fallbackModel !== model) {
          try {
            usedModel = fallbackModel;
            rawResponse = await postCompletion(fallbackModel, messages, tools);
          } catch (fallbackErr) {
            throw primaryErr;
          }
        } else {
          throw primaryErr;
        }
      }

      const choice = rawResponse?.choices?.[0];
      const message = choice?.message || {};
      const rawContent = message.content || '';
      const cleanContent = stripThinkingBlocks(rawContent);

      const toolCalls = Array.isArray(message.tool_calls)
        ? message.tool_calls.map((tc) => ({
            id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || '{}',
          }))
        : [];

      return {
        content: cleanContent,
        toolCalls,
        model: rawResponse?.model || usedModel,
      };
    },
  };
}

/**
 * Returns a live Featherless client instance if process.env.FEATHERLESS_API_KEY is configured,
 * or null if no credentials exist.
 */
export function getLiveFeatherlessClient() {
  const key = typeof process.env.FEATHERLESS_API_KEY === 'string'
    ? process.env.FEATHERLESS_API_KEY.trim()
    : '';
  if (!key) {
    return null;
  }
  return createFeatherlessClient({ apiKey: key });
}

