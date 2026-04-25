/**
 * Event prediction market types — the shape agents, panels, and the SDK
 * all speak when dealing with Kalshi / Polymarket markets.
 *
 * Design note: `source`-agnostic from the moment we return to the client.
 * Both venues report very different raw shapes; normalization happens in
 * `apps/api-core/src/services/events/*-adapter.ts`. Downstream consumers
 * (web, SDK, agent-engine) should never touch Kalshi or Polymarket's raw
 * JSON — always go through EventMarket.
 */

/**
 * Our canonical event categories. Both Kalshi and Polymarket use different
 * taxonomies; `category-map.ts` flattens their vocabulary into this list.
 */
export type EventCategory =
  | 'politics'
  | 'economics'
  | 'climate'
  | 'culture'
  | 'sports'
  | 'science'
  | 'tech'
  | 'geopolitics'
  | 'other';

export const EVENT_CATEGORIES: readonly {
  id: EventCategory;
  label: string;
  /** UI accent in our brand palette */
  color: string;
  /** Short hint to show under the label in the nav / filter strip */
  hint: string;
}[] = [
  { id: 'politics',    label: 'Politics',    color: '#EF4444', hint: 'Elections · policy · appointments' },
  { id: 'economics',   label: 'Economics',   color: '#F59E0B', hint: 'Fed · inflation · jobs' },
  { id: 'sports',      label: 'Sports',      color: '#22D3EE', hint: 'Leagues · championships' },
  { id: 'climate',     label: 'Climate',     color: '#34D399', hint: 'Temp · emissions · disasters' },
  { id: 'culture',     label: 'Culture',     color: '#E879F9', hint: 'Awards · charts · trends' },
  { id: 'science',     label: 'Science',     color: '#60A5FA', hint: 'Discoveries · missions' },
  { id: 'tech',        label: 'Tech',        color: '#A78BFA', hint: 'Products · regulation' },
  { id: 'geopolitics', label: 'Geopolitics', color: '#FB7185', hint: 'Conflict · treaties' },
  { id: 'other',       label: 'Other',       color: '#94A3B8', hint: 'Everything else' },
] as const;

/**
 * Normalized shape served by /events/*. Stable across venues.
 *
 * `id` format:
 *   - `kalshi-<TICKER>`   e.g. `kalshi-TRUMP2028`
 *   - `poly-<slug-or-id>` e.g. `poly-will-ethereum-hit-5k`
 * Use this as the `market` column on `predictions` rows when seeding
 * event predictions — the same column we use for `BTC/USD`.
 */
export interface EventMarket {
  id: string;
  source: 'kalshi' | 'polymarket';

  category: EventCategory;
  /** The resolution question, verbatim. */
  question: string;
  /** Plain-English resolution criteria, when the venue provides one. */
  subtitle?: string;
  /** Comma-delimited tags the venue exposed — useful for LLM prompts. */
  tags: string[];
  /** URL on the source venue (always safe to deep-link to). */
  url: string;
  /** Cover/hero image if the venue offers one (Polymarket usually does). */
  imageUrl?: string;

  /** 0–1, probability the market implies for YES. */
  yesPrice: number;
  /** 1 − yesPrice, stored for convenience. */
  noPrice: number;
  /** Volume in USD-equivalent. Time window varies by source — use as a
   *  relative liquidity proxy, not an absolute figure. */
  volumeUsd: number;
  openInterestUsd?: number;
  liquidityUsd?: number;

  /** Trading close time (ISO). */
  closeTime: string;
  /** Resolution deadline (ISO) — sometimes later than closeTime. */
  resolveBy?: string;

  /** True once the venue published an outcome. */
  resolved: boolean;
  outcome?: 'yes' | 'no' | 'void';

  /** Server timestamp when we last fetched this market. */
  fetchedAt: number;
}

/**
 * Per-agent preferences for event prediction — stored as JSONB on the
 * agents table, consumed by the seed-events-daily cron.
 */
export interface EventPreferences {
  enabled: boolean;
  sources: ('kalshi' | 'polymarket')[];
  categories: EventCategory[];
  /** Skip markets with lower liquidity. Default 10_000. */
  minVolumeUsd: number;
  /** Min absolute probability-point edge vs market price to publish. Default 0.05. */
  minEdge: number;
  /** Min model confidence (0-1) to publish. Default 0.55. */
  minConfidence: number;
  /** Max signals per day per agent. Default 5. */
  maxPerDay: number;
  /** Only consider markets resolving within N days. 0 = no limit. Default 30. */
  horizonDays: number;
}

export const DEFAULT_EVENT_PREFERENCES: EventPreferences = {
  enabled: false,
  sources: ['kalshi', 'polymarket'],
  categories: ['politics', 'economics', 'sports', 'climate', 'culture', 'science', 'tech', 'geopolitics', 'other'],
  minVolumeUsd: 10_000,
  // 2pp minimum edge — lets agents weigh in on extreme markets (95%+)
  // where even a small delta is a real opinion.
  minEdge: 0.02,
  minConfidence: 0.55,
  // 8/day so a single Oracle agent can cover the full daily drop across
  // categories without the seeder clipping it on the default curated trio.
  maxPerDay: 8,
  horizonDays: 90,
};
