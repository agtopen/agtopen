/**
 * Helpers for classifying + pretty-printing OpenAI SDK errors so tick
 * logs don't drown in 80-line stack traces when the account hits a
 * billing wall or a transient rate limit.
 *
 * Typical noise without this — one `insufficient_quota` per agent per
 * tick (~13 agents × 10 ticks/min) dumps the full response payload
 * every time:
 *
 *     error: 429 You exceeded your current quota...
 *     status: 429,
 *     headers: { ... 20 lines ... },
 *     request_id: "...",
 *     error: { message: "...", type: "insufficient_quota" },
 *     at new OpenAIError (1:23)
 *     at new APIError (/app/node_modules/openai/error.mjs:7:9)
 *     at new RateLimitError (1:23)
 *     ... 5 more frames ...
 *
 * With `formatLLMError()` that collapses to one line:
 *
 *     [openai] 429 insufficient_quota — account out of credit
 *
 * ALSO throttles repeated identical errors so a persistent billing
 * outage doesn't fill the log with the same message — first occurrence
 * logs normally, next identical error within the window just
 * increments a counter and is silent.
 */

export interface ClassifiedLLMError {
  /** HTTP status, when it's an API response error. Undefined for
   *  network errors or unknown shapes. */
  status?: number;
  /** OpenAI error `code` field (`insufficient_quota`, `rate_limit_exceeded`,
   *  `model_not_found`, `invalid_api_key`, …) when present. */
  code?: string;
  /** Short human summary — never includes the stack. */
  summary: string;
  /** True iff the problem is billing-side (account out of credit). */
  isQuota: boolean;
  /** True iff the problem is a transient rate-limit (not quota). */
  isRateLimit: boolean;
  /** True iff the API key is missing / invalid. */
  isAuth: boolean;
}

/** Read a field off an unknown object without caring about typing. */
function get(err: unknown, key: string): any {
  if (!err || typeof err !== 'object') return undefined;
  return (err as any)[key];
}

export function classifyLLMError(err: unknown): ClassifiedLLMError {
  const status = get(err, 'status') as number | undefined;
  // OpenAI SDK nests the structured code under .error.code and mirrors
  // it at the top level on some versions — check both.
  const nestedCode = get(get(err, 'error'), 'code') as string | undefined;
  const code = (get(err, 'code') as string | undefined) ?? nestedCode;
  const msg = String(get(err, 'message') ?? 'unknown error');

  const isQuota = code === 'insufficient_quota' || /insufficient_quota/.test(msg);
  const isRateLimit = !isQuota && (status === 429 || code === 'rate_limit_exceeded');
  const isAuth = status === 401 || code === 'invalid_api_key' || code === 'missing_api_key';

  const summary = isQuota
    ? `${status ?? '?'} insufficient_quota — OpenAI account out of credit (check platform.openai.com/billing)`
    : isRateLimit
      ? `${status ?? 429} rate_limit_exceeded — slow down requests`
      : isAuth
        ? `${status ?? 401} auth — OPENAI_API_KEY missing or invalid`
        : `${status ?? '?'}${code ? ` ${code}` : ''} ${msg.slice(0, 200)}`;

  // Auto-trip the quota circuit breaker the first time we see a
  // billing error. Any downstream caller that classifies an error
  // will keep the breaker open — callers don't have to remember to
  // do it manually.
  if (isQuota) tripQuotaBreaker();

  return { status, code, summary, isQuota, isRateLimit, isAuth };
}

/** One-line label ready for `console.warn` / `console.error`. */
export function formatLLMError(scope: string, err: unknown): string {
  const c = classifyLLMError(err);
  return `[${scope}] [openai] ${c.summary}`;
}

// ── Log throttle ────────────────────────────────────────────────────
// For repeating quota errors specifically — burns the first hit as a
// full warn, then silently counts subsequent identical hits until the
// window expires, then emits a summary. Keeps operators informed
// without spamming the tail.

const THROTTLE_WINDOW_MS = 60_000; // 60 s
const buckets = new Map<string, { firstLoggedAt: number; suppressed: number }>();

/**
 * Log once per `THROTTLE_WINDOW_MS` per unique key. Returns true if the
 * caller should log normally, false if they should suppress.
 *
 * Typical use:
 *
 *   const c = classifyLLMError(err);
 *   if (shouldLogLLMError(`nova:${c.code}`)) {
 *     console.warn(formatLLMError('nova-agent', err));
 *   }
 */
export function shouldLogLLMError(key: string): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.firstLoggedAt > THROTTLE_WINDOW_MS) {
    // New window: if we're replacing an older bucket that had
    // suppressed entries, flush a summary so the operator sees the
    // true volume.
    if (entry && entry.suppressed > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[llm-error] (throttled) ${entry.suppressed} additional "${key}" error(s) ` +
        `in the last ${Math.round((now - entry.firstLoggedAt) / 1000)}s`,
      );
    }
    buckets.set(key, { firstLoggedAt: now, suppressed: 0 });
    return true;
  }
  entry.suppressed += 1;
  return false;
}

// ── Quota circuit breaker ───────────────────────────────────────────
// When the OpenAI account hits insufficient_quota, there's no point
// firing 13 agents × N ticks/min of requests that will all 429 —
// we'd just burn rate-limit budget + spam the log. Trip a breaker
// for BREAKER_PAUSE_MS and skip tick work while it's open.

/** How long to pause tick work after a quota error. 10 min matches
 *  the cadence of a human noticing + topping up the account; the
 *  breaker re-closes automatically after the window. */
const BREAKER_PAUSE_MS = 10 * 60 * 1000;

let breakerOpenUntil = 0;
let breakerTripCount = 0;

/** Open the breaker for BREAKER_PAUSE_MS. Safe to call on every
 *  quota error — we extend the window rather than compounding it,
 *  so a burst of errors still unblocks at t+10min. */
export function tripQuotaBreaker(): void {
  const now = Date.now();
  const nextOpenUntil = now + BREAKER_PAUSE_MS;
  // Only log the "tripped" event on the first trip of a new cycle —
  // subsequent ones in the same window just extend the window
  // silently (avoids the same "breaker tripped" line spamming on
  // every sub-request of a single failing tick).
  if (breakerOpenUntil < now) {
    breakerTripCount += 1;
    // eslint-disable-next-line no-console
    console.warn(
      `[llm-error] quota breaker TRIPPED — pausing LLM calls until ` +
      `${new Date(nextOpenUntil).toISOString()} (${Math.round(BREAKER_PAUSE_MS / 1000)}s). ` +
      `Top up OpenAI at platform.openai.com/settings/organization/billing/overview. ` +
      `Trip #${breakerTripCount}.`,
    );
  }
  breakerOpenUntil = nextOpenUntil;
}

/** True when the breaker is open and callers should skip any work
 *  that would hit OpenAI. Also emits a "closed" log line the first
 *  time it returns false after being open. */
let lastReportedOpen = false;
export function isQuotaBreakerOpen(): boolean {
  const open = Date.now() < breakerOpenUntil;
  if (!open && lastReportedOpen) {
    // eslint-disable-next-line no-console
    console.log('[llm-error] quota breaker CLOSED — resuming LLM calls');
  }
  lastReportedOpen = open;
  return open;
}

/** Seconds until the breaker closes (0 if already closed). */
export function quotaBreakerRemainingMs(): number {
  return Math.max(0, breakerOpenUntil - Date.now());
}
