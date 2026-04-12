/**
 * AI Model Configuration for AGTOPEN
 *
 * Strategy:
 * - gpt-4o for CORE VALUE features (predictions, deep analysis, risk, security)
 *   -> These define the product quality. Saving $14/month isn't worth bad predictions.
 *
 * - gpt-4o-mini for HIGH VOLUME features (sentiment, news, narrative, commentary)
 *   -> Quality is "good enough", volume is high, savings matter.
 *
 * Cost comparison (per 1M tokens):
 *   gpt-4o-mini:  $0.15 input / $0.60 output
 *   gpt-4o:       $2.50 input / $10.00 output
 */

export const AI_MODELS = {
  /** Cheap & fast — chat, simple analysis, memory extraction */
  fast: 'gpt-4o-mini' as const,

  /** Smart & accurate — predictions, security, complex reasoning */
  smart: 'gpt-4o' as const,
} as const;

/** Which model each agent task should use */
export const TASK_MODELS = {
  // ── CORE VALUE (gpt-4o) ─────────────────────────────────
  // These features ARE the product. Quality = credibility = growth.
  oraclePrediction: AI_MODELS.smart,        // predictions are everything
  futuresBranchGeneration: AI_MODELS.smart,  // 1000 branches need deep reasoning
  criticalSecurityAlert: AI_MODELS.smart,    // can't miss real threats
  complexSwarmAnalysis: AI_MODELS.smart,     // multi-agent synthesis

  // Agent tasks — smart (predictions, deep analysis, risk, security)
  prometheusOutlook: AI_MODELS.smart,        // strategic foresight, macro analysis
  athenaPattern: AI_MODELS.smart,            // pattern recognition, cross-correlation
  deepmindRisk: AI_MODELS.smart,             // risk modeling, VaR, drawdown
  cipherForensics: AI_MODELS.smart,          // on-chain forensics, DeFi security
  quantSignal: AI_MODELS.smart,              // quantitative modeling, statistical signals
  epochCycle: AI_MODELS.smart,               // historical cycle analysis, tipping points
  specterManipulation: AI_MODELS.smart,      // manipulation detection, wash trading
  emergenceSystem: AI_MODELS.smart,          // complex systems, regime changes

  // ── HIGH VOLUME (gpt-4o-mini) ───────────────────────────
  // Quality is fine, volume is high, personality-driven (prompt matters more than model).
  consultChat: AI_MODELS.fast,               // personality chat, mini is great
  wireConversation: AI_MODELS.fast,          // agent-agent, lower stakes
  sentinelScan: AI_MODELS.fast,              // basic anomaly detection
  memoryExtraction: AI_MODELS.fast,          // simple JSON extraction

  // Agent tasks — fast (sentiment, news, narrative, commentary)
  hermesSentiment: AI_MODELS.fast,           // news sentiment, high frequency
  nexus7Correlation: AI_MODELS.fast,         // cross-chain correlation
  museNarrative: AI_MODELS.fast,             // creative market narratives
  psycheSentiment: AI_MODELS.fast,           // fear/greed, crowd psychology
  meridianDeFi: AI_MODELS.fast,              // DeFi protocol analysis, macro
  novaAlpha: AI_MODELS.fast,                 // emerging trends, frontier tech
  abyssWhale: AI_MODELS.fast,               // dark pool, whale tracking
  atlasGeo: AI_MODELS.fast,                  // geopolitical analysis
} as const;

export type AIModel = typeof AI_MODELS[keyof typeof AI_MODELS];
