/**
 * AI Model Configuration for AGTOPEN
 *
 * Strategy:
 * - gpt-5 for CORE VALUE features (predictions, deep analysis, risk, security)
 *   -> Reasoning model — newer + cheaper input than gpt-4o + genuinely
 *      smarter on multi-step logic (predictions, pattern recognition).
 *      ⚠ gpt-5 uses reasoning tokens inside the completion budget, so
 *      every call site MUST go through aiComplete/aiJSON/aiStream
 *      which branch on model family and pass max_completion_tokens +
 *      reasoning_effort='minimal' for us. Don't call the SDK directly.
 *
 * - gpt-4o-mini for HIGH VOLUME features (sentiment, news, narrative, commentary)
 *   -> Quality is "good enough", volume is high, savings matter.
 *
 * Cost comparison (per 1M tokens, April 2026):
 *   gpt-4o-mini:  $0.15 input / $0.60 output
 *   gpt-4o:       $2.50 input / $10.00 output   (legacy — replaced)
 *   gpt-5:        $1.25 input / $10.00 output   (current smart tier)
 *   gpt-5-nano:   $0.05 input / $0.40 output   (used for Agora debates)
 */

export const AI_MODELS = {
  /** Cheap & fast — chat, simple analysis, memory extraction.
   *  gpt-5-nano is a reasoning model but the smallest tier; 3× cheaper
   *  input than gpt-4o-mini and with a better instruction-following
   *  floor. Same reasoning-token caveats as gpt-5 — aiComplete/aiJSON
   *  handle max_completion_tokens + reasoning_effort automatically. */
  fast: 'gpt-5-nano' as const,

  /** Smart & accurate — predictions, security, complex reasoning.
   *  gpt-5 is a reasoning model: aiComplete/aiJSON/aiStream detect
   *  that and send max_completion_tokens + reasoning_effort instead
   *  of max_tokens + temperature. */
  smart: 'gpt-5' as const,
} as const;

/** Which model each agent task should use.
 *
 * Post-April-2026 cost review: burning $25 in 19 days on tick-driven
 * agent calls was unsustainable for a pre-revenue product. Only the
 * three "headline" agents (Oracle, Athena, Prometheus) keep gpt-4o —
 * they're the ones users read predictions from, and their cadence is
 * already once per 3 ticks / daily so the extra quality is affordable.
 * The other six smart-tier agents got downgraded to gpt-4o-mini
 * (~15× cheaper): their role is breadth of analysis, not the single
 * most-quoted line of the day.
 */
export const TASK_MODELS = {
  // ── HEADLINE AGENTS (gpt-4o) ────────────────────────────
  // Kept on smart because their output is what users see first in
  // Predictions / Daily Outlook / Deep Pattern panels. Quality here
  // directly drives credibility + growth.
  oraclePrediction: AI_MODELS.smart,         // every-3-ticks prediction
  prometheusOutlook: AI_MODELS.smart,        // daily strategic outlook
  athenaPattern: AI_MODELS.smart,            // daily pattern + cross-correlation

  // ── HIGH-CEREMONY TASKS (gpt-4o) ────────────────────────
  // Rare, user-triggered, or high-stakes one-shots — cost per call is
  // basically noise because they don't run on the tick loop.
  futuresBranchGeneration: AI_MODELS.smart,  // 1000 branches need deep reasoning
  criticalSecurityAlert: AI_MODELS.smart,    // can't miss real threats
  complexSwarmAnalysis: AI_MODELS.smart,     // multi-agent synthesis

  // ── DOWNGRADED TO FAST (was smart) ──────────────────────
  // These six used to be on gpt-4o. Post cost-review they moved to
  // gpt-4o-mini — they run on the tick loop every 2-8 ticks, so the
  // 15× cost delta compounds fast. Quality check: their system
  // prompts are strong enough that mini still produces usable output.
  deepmindRisk: AI_MODELS.fast,              // daily risk modeling
  cipherForensics: AI_MODELS.fast,           // on-chain forensics (was every 3 ticks)
  quantSignal: AI_MODELS.fast,               // quantitative signal (was every 2 ticks)
  epochCycle: AI_MODELS.fast,                // daily historical cycle analysis
  specterManipulation: AI_MODELS.fast,       // manipulation detection (was every 3 ticks)
  emergenceSystem: AI_MODELS.fast,           // regime-change detection (was every 4 ticks)

  // ── ALWAYS FAST (gpt-4o-mini) ───────────────────────────
  // Personality-driven chat + high-volume sentiment — prompt
  // engineering matters more than model tier here.
  consultChat: AI_MODELS.fast,               // personality chat, mini is great
  wireConversation: AI_MODELS.fast,          // agent-agent, lower stakes
  sentinelScan: AI_MODELS.fast,              // basic anomaly detection
  memoryExtraction: AI_MODELS.fast,          // simple JSON extraction
  hermesSentiment: AI_MODELS.fast,           // news sentiment, high frequency
  nexus7Correlation: AI_MODELS.fast,         // cross-chain correlation
  museNarrative: AI_MODELS.fast,             // creative market narratives
  psycheSentiment: AI_MODELS.fast,           // fear/greed, crowd psychology
  meridianDeFi: AI_MODELS.fast,              // DeFi protocol analysis, macro
  novaAlpha: AI_MODELS.fast,                 // emerging trends, frontier tech
  abyssWhale: AI_MODELS.fast,                // dark pool, whale tracking
  atlasGeo: AI_MODELS.fast,                  // geopolitical analysis
} as const;

export type AIModel = typeof AI_MODELS[keyof typeof AI_MODELS];
