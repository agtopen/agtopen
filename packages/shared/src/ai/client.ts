import OpenAI from 'openai';
import type { AIModel } from '../constants/models';
import {
  classifyLLMError,
  isQuotaBreakerOpen,
  quotaBreakerRemainingMs,
} from './errors';

let _client: OpenAI | null = null;

export function getAIClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _client;
}

// ── Reasoning-model handling ────────────────────────────────────────
// gpt-5, gpt-5-mini, gpt-5-nano, o1, o1-mini, o3, o3-mini are
// reasoning models — they take `max_completion_tokens` (not `max_tokens`)
// and silently burn hidden reasoning tokens inside that budget. A
// too-small budget produces empty completions (the infamous
// "starvation" bug — see commit 7133cf9 fix(consult): GPT-5 reasoning
// budget starvation → empty replies). Temperature is ignored. We
// detect by prefix and branch the param shape.

function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model);
}

/**
 * Minimum budget for reasoning models. Reasoning tokens are billed
 * + counted toward `max_completion_tokens` BEFORE the visible output.
 * Tick-driven agents typically ask for 150-350 tokens of output text
 * (configured in packages/shared/src/constants/agents.ts), but if we
 * pass that to a reasoning model, reasoning eats the whole budget
 * and the completion comes back empty — the "No output" rows you'll
 * see in scheduler logs.
 *
 * Minimums chosen empirically from the gpt-5-nano smoke test:
 *   - 2000 for free-form completions (1-3 sentence agent reply +
 *     reasoning pass)
 *   - 3000 for JSON (reasoning is heavier on structured outputs —
 *     the model "plans" the schema)
 *
 * Callers that explicitly pass a LARGER budget keep it; we only
 * floor the undersized ones.
 */
const REASONING_MIN_COMPLETION_TOKENS = 2000;
const REASONING_MIN_JSON_TOKENS = 3000;

/**
 * Build the param bag for chat.completions.create — branches on model
 * family so callers never have to think about it. For reasoning
 * models we always ask for `reasoning_effort='minimal'` (tick-driven
 * agents don't need the extra thinking budget) and floor the
 * budget to the reasoning-model minimum so the output survives
 * reasoning-token consumption.
 */
function buildCompletionParams(opts: {
  model: string;
  temperature?: number;
  maxTokens?: number;
  messages: Array<{ role: string; content: string }>;
  responseFormat?: { type: 'json_object' };
  stream?: boolean;
}): Record<string, any> {
  const base: Record<string, any> = {
    model: opts.model,
    messages: opts.messages,
  };
  if (opts.responseFormat) base.response_format = opts.responseFormat;
  if (opts.stream) base.stream = true;

  if (isReasoningModel(opts.model)) {
    // Floor the budget at the reasoning minimum. Callers that pass
    // e.g. maxTokens=200 (fine for gpt-4o-mini) would starve the
    // output on gpt-5-nano; we bump to at least 2000/3000 silently.
    const floor = opts.responseFormat
      ? REASONING_MIN_JSON_TOKENS
      : REASONING_MIN_COMPLETION_TOKENS;
    const wanted = opts.maxTokens ?? floor;
    base.max_completion_tokens = Math.max(wanted, floor);
    base.reasoning_effort = 'minimal';
    // temperature is ignored on reasoning models — don't pass it,
    // some SDKs warn.
  } else {
    base.temperature = opts.temperature ?? 0.5;
    base.max_tokens = opts.maxTokens ?? 300;
  }
  return base;
}

/**
 * Thrown when the circuit breaker is open. Callers can catch this
 * specifically to distinguish "we intentionally skipped the LLM"
 * from "the LLM failed". Agents use this to return null / log a
 * one-line skip notice instead of retrying.
 */
export class QuotaBreakerOpenError extends Error {
  readonly remainingMs: number;
  constructor(remainingMs: number) {
    super(`OpenAI quota breaker open — ${Math.ceil(remainingMs / 1000)}s remaining`);
    this.name = 'QuotaBreakerOpenError';
    this.remainingMs = remainingMs;
  }
}

/**
 * Short-circuit before any HTTP call if the breaker is open. Callers
 * that wrap aiComplete / aiJSON / aiStream get a fast, typed error
 * instead of burning a round-trip that's guaranteed to 429.
 */
function guardBreaker(): void {
  if (isQuotaBreakerOpen()) {
    throw new QuotaBreakerOpenError(quotaBreakerRemainingMs());
  }
}

/**
 * Wrap a pending OpenAI promise so that any thrown error passes
 * through classifyLLMError — that auto-trips the breaker on
 * insufficient_quota so the NEXT call short-circuits at guardBreaker.
 * Re-throws the original error so catch-site semantics don't change.
 */
async function withBreaker<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    classifyLLMError(err); // side-effect: trips breaker if quota
    throw err;
  }
}

/** Simple completion — returns text string */
export async function aiComplete(opts: {
  model: AIModel;
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  guardBreaker();
  const client = getAIClient();
  const params = buildCompletionParams({
    model: opts.model,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.prompt },
    ],
  });
  const response = await withBreaker(client.chat.completions.create(params as any));
  return (response as any).choices[0]?.message?.content || '';
}

/** JSON completion — returns parsed object */
export async function aiJSON<T = any>(opts: {
  model: AIModel;
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  /** Optional scope label for logs when the completion fails. Helps
   *  trace "No output" back to a specific agent. */
  scope?: string;
}): Promise<T | null> {
  guardBreaker();
  const client = getAIClient();
  const params = buildCompletionParams({
    model: opts.model,
    temperature: opts.temperature ?? 0.3,
    // JSON tasks need a bit more headroom even on legacy models —
    // 500 was fine for gpt-4o but reasoning models eat tokens first.
    maxTokens: opts.maxTokens ?? (isReasoningModel(opts.model) ? 3000 : 500),
    messages: [
      { role: 'system', content: opts.system + '\n\nAlways respond with valid JSON.' },
      { role: 'user', content: opts.prompt },
    ],
    responseFormat: { type: 'json_object' },
  });
  const response = await withBreaker(client.chat.completions.create(params as any));

  const choice = (response as any).choices[0];
  const text = choice?.message?.content || '';
  const finishReason = choice?.finish_reason;
  const scope = opts.scope ?? 'aiJSON';

  // Empty completion → reasoning budget starvation is the top
  // suspect on gpt-5* models. Log once per call so operators can see
  // which agents are undersized. The bumped
  // REASONING_MIN_COMPLETION_TOKENS already guards against most of
  // this, but prompt-heavy agents (Athena pattern analysis) may still
  // need explicit `maxTokens` overrides.
  if (!text.trim()) {
    // eslint-disable-next-line no-console
    console.warn(
      `[${scope}] empty completion from ${opts.model} ` +
      `(finish=${finishReason ?? '?'}) — likely reasoning-budget starvation, ` +
      `try passing a larger maxTokens.`,
    );
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    // eslint-disable-next-line no-console
    console.warn(
      `[${scope}] invalid JSON from ${opts.model}: ` +
      `${text.slice(0, 200)}${text.length > 200 ? '…' : ''}`,
    );
    return null;
  }
}

/** Streaming completion — returns AsyncIterable of text chunks */
export async function aiStream(opts: {
  model: AIModel;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}) {
  guardBreaker();
  const client = getAIClient();
  const params = buildCompletionParams({
    model: opts.model,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    messages: [
      { role: 'system', content: opts.system },
      ...opts.messages,
    ],
    stream: true,
  });
  return withBreaker(client.chat.completions.create(params as any));
}

// Re-export so callers can import breaker utilities from the same
// module they already use for aiComplete/aiJSON.
export {
  classifyLLMError,
  formatLLMError,
  shouldLogLLMError,
  isQuotaBreakerOpen,
  quotaBreakerRemainingMs,
  tripQuotaBreaker,
} from './errors';
export type { ClassifiedLLMError } from './errors';
