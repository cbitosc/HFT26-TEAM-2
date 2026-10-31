/**
 * server/helm/index.js
 * Core server-side handler for `/api/helm`.
 *
 * Security & Honesty Guarantees:
 *   - Never reads `.env.local` or exposes any API key or upstream headers.
 *   - Validates incoming request bodies with `HelmRequestSchema`.
 *   - Executes Canned Queries #1-#5 deterministically over the snapshot.
 *   - Supports an injectable `llmClient` for testing the tool-calling loop,
 *     one-retry tool argument recovery, and `validateHelmOutput` regeneration/fallback
 *     without making live network calls.
 */

import { HelmRequestSchema, HelmResponseSchema } from '../../shared/schemas.js';
import { getServerSnapshot } from './snapshotStore.js';
import { executeToolCall, formatFieldSummary } from './tools.js';
import { executeCannedQuery, buildDeterministicFallback } from './canned.js';
import { validateHelmOutput } from './validate.js';
import { HELM_SYSTEM_PROMPT, HELM_TOOL_DEFINITIONS } from './prompts.js';

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
 * Builds a deterministic template answer from the executed tool results when
 * the model's prose fails validation twice.
 */
function buildTemplateFromToolResults(toolHistory, collectedActions, userMessage, snapshot, notice) {
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
 * @param {object} reqBody - Raw request JSON body
 * @param {object} [options]
 * @param {object} [options.snapshot] - Optional preloaded snapshot override
 * @param {Function|object} [options.llmClient] - Optional injectable LLM client (`async ({ messages, tools }) => { content, toolCalls, model }`)
 * @param {boolean} [options.preferCanned=true] - Whether to short-circuit matched canned queries when no llmClient is forced
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function handleHelmRequest(reqBody, options = {}) {
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

  const snapshot = options.snapshot ?? getServerSnapshot();
  const { message, history = [], ui } = parsedReq.data;
  const llmClient = options.llmClient ?? null;
  const preferCanned = options.preferCanned !== undefined ? Boolean(options.preferCanned) : !llmClient;

  // 1. Deterministic Canned Query path (always active when AI is off or preferCanned is true)
  if (preferCanned) {
    const cannedResponse = executeCannedQuery(message, snapshot);
    if (cannedResponse) {
      return {
        status: 200,
        body: cannedResponse,
      };
    }
  }

  // 2. If no injectable llmClient is provided, return deterministic fallback (zero live network calls)
  if (!llmClient) {
    const cannedResponse = executeCannedQuery(message, snapshot);
    if (cannedResponse) {
      return {
        status: 200,
        body: cannedResponse,
      };
    }
    const fallbackResponse = buildDeterministicFallback(message, snapshot);
    return {
      status: 200,
      body: fallbackResponse,
    };
  }

  // 3. Tool-calling + output-validation loop with injectable llmClient
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
  let lastModelName = 'mock-llm';

  try {
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
  } catch (_err) {
    return {
      status: 200,
      body: buildTemplateFromToolResults(
        toolHistory,
        collectedActions,
        message,
        snapshot,
        'AI service error; showing deterministic snapshot response.'
      ),
    };
  }
}
