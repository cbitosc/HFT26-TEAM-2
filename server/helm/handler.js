/**
 * server/helm/handler.js
 * Primary server-side request handler for `/api/helm`.
 *
 * Rules & Architecture (AGENTS.md Section 1, ARCHITECTURE.md Sections 5 & 8):
 *   - Pinned Featherless provider via server/helm/llm.js; credentials never reach browser.
 *   - Concurrency semaphore (HELM_MAX_INFLIGHT, wait timeout HELM_QUEUE_WAIT_MS -> 429).
 *   - Per-IP rate limiting (HELM_RATE_LIMIT_PER_MIN -> 429).
 *   - Typed, zod-validated tool calling over the snapshot (never invent or zero-fill).
 *   - Defence-in-depth output validator (server/helm/validate.js) enforcing receipt tokens,
 *     naked-number ban, and habitability-verdict ban.
 *   - Maximum 1 corrective retry for invalid tool args or invalid prose before falling back
 *     to deterministic template answer.
 *   - 100% preservation of offline canned queries #1-#5.
 */

import { HelmRequestSchema, HelmResponseSchema } from '../../shared/schemas.js';
import { getServerSnapshot } from './snapshotStore.js';
import { executeToolCall, formatFieldSummary } from './tools.js';
import { executeCannedQuery, buildDeterministicFallback } from './canned.js';
import { validateHelmOutput } from './validate.js';
import { HELM_SYSTEM_PROMPT, HELM_TOOL_DEFINITIONS } from './prompt.js';
import { withHelmConcurrency, checkRateLimit } from './queue.js';
import { getLiveFeatherlessClient } from './llm.js';

const MAX_MODEL_CALLS = 3;

function parseToolArguments(rawArgs) {
  if (rawArgs === null || rawArgs === undefined) return {};
  if (typeof rawArgs === 'object') return rawArgs;
  if (typeof rawArgs === 'string') {
    const trimmed = rawArgs.trim();
    if (!trimmed) return {};
    return JSON.parse(trimmed);
  }
  return {};
}

/**
 * Builds a deterministic template answer from executed tool results when
 * the model's prose fails validation or encounters fatal errors.
 */
export function buildTemplateFromToolResults(toolHistory, collectedActions, userMessage, snapshot, notice) {
  const searchEntries = toolHistory.filter((t) => t.name === 'search_planets' && t.result?.ok);
  const planetEntries = toolHistory.filter((t) => t.name === 'get_planet' && t.result?.ok);
  const compareEntries = toolHistory.filter((t) => t.name === 'compare_planets' && t.result?.ok);

  let text = '';

  if (searchEntries.length > 0) {
    const lastSearch = searchEntries[searchEntries.length - 1].result;
    const rows = lastSearch.rows || [];
    if (rows.length > 0) {
      const items = rows.slice(0, 6).map((r) => {
        const rad = r.fields?.pl_rade?.status === 'known' ? r.fields.pl_rade.token : 'unknown';
        const dist = r.fields?.sy_dist?.status === 'known' ? r.fields.sy_dist.token : 'unknown';
        return `${r.name} (radius ${rad}, distance ${dist})`;
      });
      text = `Matched ${rows.length} confirmed planets in the archive snapshot: ${items.join('; ')}. All measurements carry provenance receipts and represent observational indicators only.`;
    }
  } else if (planetEntries.length > 0) {
    const p = planetEntries[planetEntries.length - 1].result.planet;
    const rad = formatFieldSummary(p.id, 'pl_rade', p.fields?.pl_rade);
    const dist = formatFieldSummary(p.id, 'sy_dist', p.fields?.sy_dist);
    const radStr = rad.status === 'known' ? rad.token : 'unknown';
    const distStr = dist.status === 'known' ? dist.token : 'unknown';
    text = `${p.name} has archive radius ${radStr} and system distance ${distStr}. Inspect the receipt chips on the planet card for uncertainties and published references.`;
  } else if (compareEntries.length > 0) {
    const names = compareEntries[compareEntries.length - 1].result.planets.map((p) => p.name);
    text = `Opened comparison view for ${names.join(' and ')}. Inspect the comparison panel for side-by-side archive receipts.`;
  }

  if (text) {
    const validated = validateHelmOutput({ text, actions: collectedActions }, snapshot);
    if (validated.ok && validated.segments.length > 0) {
      return HelmResponseSchema.parse({
        segments: validated.segments,
        actions: validated.validActions,
        meta: {
          snapshotId: snapshot.snapshotId,
          model: 'deterministic-template-fallback',
          source: 'fallback',
          notice:
            notice ??
            'Model prose did not pass strict scientific receipt validation; showing deterministic tool summary.',
        },
      });
    }
  }

  return buildDeterministicFallback(
    userMessage,
    snapshot,
    notice ?? 'Using deterministic snapshot fallback.'
  );
}

/**
 * Executes the HELM request pipeline.
 *
 * @param {object} reqBody - Incoming JSON payload
 * @param {object} [options]
 * @param {object} [options.snapshot] - Optional preloaded snapshot override
 * @param {Function|object|null} [options.llmClient] - Injectable LLM client or null for auto-detect
 * @param {boolean} [options.preferCanned] - Prefer deterministic canned queries when matched
 * @param {string} [options.clientIp] - Client IP for rate-limiting
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function handleHelmRequest(reqBody, options = {}) {
  // 1. Validate payload schema
  const parsedReq = HelmRequestSchema.safeParse(reqBody);
  if (!parsedReq.success) {
    return {
      status: 400,
      body: {
        error: 'Invalid HELM request payload.',
        issues: parsedReq.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    };
  }

  // 2. Per-IP rate limiting
  const clientIp = options.clientIp || options.ip || 'anonymous';
  if (!checkRateLimit(clientIp)) {
    return {
      status: 429,
      body: {
        error: 'Rate limit exceeded. Please wait a moment before trying again.',
        rateLimited: true,
      },
    };
  }

  const snapshot = options.snapshot ?? getServerSnapshot();
  const { message, history = [], ui } = parsedReq.data;

  // Resolve LLM client: options override > live client > null
  const llmClient = options.llmClient !== undefined
    ? options.llmClient
    : getLiveFeatherlessClient();

  const preferCanned = options.preferCanned !== undefined
    ? Boolean(options.preferCanned)
    : !llmClient;

  // 3. Fast-path: Matched canned query when canned is preferred
  if (preferCanned) {
    const cannedResponse = executeCannedQuery(message, snapshot);
    if (cannedResponse) {
      return {
        status: 200,
        body: cannedResponse,
      };
    }
  }

  // 4. Offline mode / No API key configured
  if (!llmClient) {
    const cannedResponse = executeCannedQuery(message, snapshot);
    if (cannedResponse) {
      return {
        status: 200,
        body: cannedResponse,
      };
    }
    const fallbackResponse = buildDeterministicFallback(
      message,
      snapshot,
      'Live AI astronomer is currently disabled pending human authorization; showing deterministic archive snapshot results.'
    );
    return {
      status: 200,
      body: fallbackResponse,
    };
  }

  // 5. Live AI pipeline with concurrency semaphore & queue
  try {
    return await withHelmConcurrency(async () => {
      const callLlm = typeof llmClient === 'function' ? llmClient : llmClient.chat;
      const messages = [
        { role: 'system', content: HELM_SYSTEM_PROMPT },
        ...(ui
          ? [
              {
                role: 'system',
                content: `Current UI context: viewLevel=${ui.viewLevel}, selectedPlanetId=${ui.selectedPlanetId ?? 'null'}, timelineYear=${ui.timelineYear}`,
              },
            ]
          : []),
        ...history.map((h) => ({ role: h.role, content: h.text })),
        { role: 'user', content: message },
      ];

      const collectedActions = [];
      const toolHistory = [];
      let toolErrorCount = 0;
      let validationRetryCount = 0;
      let modelCalls = 0;
      let lastModelName = 'featherless-ai';

      while (modelCalls < MAX_MODEL_CALLS) {
        modelCalls += 1;
        const llmReply = await callLlm({
          messages,
          tools: HELM_TOOL_DEFINITIONS,
          callIndex: modelCalls - 1,
        });

        if (llmReply?.model) {
          lastModelName = String(llmReply.model);
        }

        const toolCalls = Array.isArray(llmReply?.toolCalls)
          ? llmReply.toolCalls
          : Array.isArray(llmReply?.tool_calls)
            ? llmReply.tool_calls
            : [];

        if (toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: llmReply.content ?? '',
            toolCalls,
          });

          for (const tc of toolCalls) {
            const toolName = tc.name ?? tc.function?.name;
            let parsedArgs;
            try {
              parsedArgs = parseToolArguments(tc.arguments ?? tc.function?.arguments);
            } catch (err) {
              toolErrorCount += 1;
              if (toolErrorCount >= 2) {
                return {
                  status: 200,
                  body: buildTemplateFromToolResults(
                    toolHistory,
                    collectedActions,
                    message,
                    snapshot,
                    'Tool argument parsing failed twice; using deterministic fallback.'
                  ),
                };
              }
              messages.push({
                role: 'tool',
                name: toolName,
                content: JSON.stringify({ error: `Invalid JSON in tool arguments: ${err.message}` }),
              });
              continue;
            }

            const toolResult = executeToolCall(toolName, parsedArgs, snapshot);
            if (!toolResult.ok) {
              toolErrorCount += 1;
              if (toolErrorCount >= 2) {
                return {
                  status: 200,
                  body: buildTemplateFromToolResults(
                    toolHistory,
                    collectedActions,
                    message,
                    snapshot,
                    'Tool argument validation failed twice; using deterministic fallback.'
                  ),
                };
              }
              messages.push({
                role: 'tool',
                name: toolName,
                content: JSON.stringify({ error: toolResult.error }),
              });
              continue;
            }

            toolHistory.push({ name: toolName, args: parsedArgs, result: toolResult });
            if (Array.isArray(toolResult.actions)) {
              collectedActions.push(...toolResult.actions);
            }

            const { actions: _omitActions, ...resultForModel } = toolResult;
            messages.push({
              role: 'tool',
              name: toolName,
              content: JSON.stringify(resultForModel),
            });
          }
          continue;
        }

        // Model returned final text answer: run defence-in-depth output validator
        const rawText = String(llmReply?.content ?? '');
        const validated = validateHelmOutput(
          { text: rawText, actions: collectedActions },
          snapshot
        );

        if (validated.ok && validated.segments.length > 0) {
          return {
            status: 200,
            body: HelmResponseSchema.parse({
              segments: validated.segments,
              actions: validated.validActions,
              meta: {
                snapshotId: snapshot.snapshotId,
                model: lastModelName,
                source: 'ai',
                notice: null,
              },
            }),
          };
        }

        // One regeneration attempt with corrective prompt if budget allows
        validationRetryCount += 1;
        if (validationRetryCount >= 2 || modelCalls >= MAX_MODEL_CALLS) {
          return {
            status: 200,
            body: buildTemplateFromToolResults(
              toolHistory,
              collectedActions,
              message,
              snapshot,
              `Model output failed validation (${validated.errors.join('; ')}); showing deterministic template.`
            ),
          };
        }

        messages.push({
          role: 'assistant',
          content: rawText,
        });
        messages.push({
          role: 'user',
          content: `CORRECTION REQUIRED: Your previous answer violated scientific honesty rules (${validated.errors.join('; ')}). Rewrite your answer using ONLY valid {{r:<planetId>.<fieldName>}} receipt tokens from the tool results, never use bare measurement digits, and never claim any planet is habitable or uninhabitable.`,
        });
      }

      return {
        status: 200,
        body: buildTemplateFromToolResults(
          toolHistory,
          collectedActions,
          message,
          snapshot,
          'Maximum tool-call turns reached; showing deterministic summary.'
        ),
      };
    });
  } catch (err) {
    if (err?.status === 429 || err?.isQueueTimeout) {
      return {
        status: 429,
        body: {
          error: 'HELM is busy. Please try again shortly or use canned queries.',
          busy: true,
        },
      };
    }
    return {
      status: 200,
      body: buildTemplateFromToolResults(
        [],
        [],
        message,
        snapshot,
        'AI service error; showing deterministic snapshot response.'
      ),
    };
  }
}
