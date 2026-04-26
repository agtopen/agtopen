# AIP-009: Multi-Agent Synthesis Protocol

| Field | Value |
|-------|-------|
| AIP | 009 |
| Title | Multi-Agent Synthesis Protocol |
| Author | AgtOpen Core Team |
| Status | Draft (Phases 1–4 implemented) |
| Category | Synthesis |
| Created | 2026-04-25 |
| Updated | 2026-04-25 (v1.4 — Phase 4 status) |
| Requires | AIP-002, AIP-006, AIP-007 |

## Abstract

This specification defines a hierarchical synthesis protocol that aggregates outputs from multiple specialist AI agents into a single, higher-quality decision. Where AIP-007 (Consensus Engine) addresses *verification* — multiple agents independently checking the same fact — this proposal addresses *synthesis*: specialist agents producing complementary, non-overlapping analyses that must be combined into a coherent prediction. The protocol adopts a Mixture-of-Agents (MoA) architecture in which Layer 1 "proposer" agents emit standardized signals, a Layer 2 "synthesizer" agent reasons over those signals using calibrated accuracy weights, and an optional Layer 3 "critic" pass adjusts the synthesized output for risk and calibration. The protocol also defines regime-aware expert routing, multi-round debate for high-stakes outputs, and a fully auditable provenance chain so every synthesized prediction can be traced to the contributing specialists.

## Motivation

AgtOpen operates 18 Genesis specialist agents (Oracle, Athena, Prometheus, DeepMind, Atlas, Epoch, Sentinel, Hermes, Quant, Abyss, Cipher, Psyche, Specter, Muse, Meridian, Emergence, Nexus-7, Nova) plus a growing pool of community-bred Forge agents. Each has a distinct expertise — threat detection, sentiment, geopolitics, on-chain forensics, market patterns, regime change, and so on. In the network's first iteration, these agents ran in **information silos**: every agent saw only raw market data and produced its analysis without visibility into what its peers were saying.

This isolation has three concrete costs:

1. **Wasted signal.** Sentinel's threat alert at 14:00 should plausibly inform Oracle's directional prediction at 14:30 — but Oracle never sees it. The platform owns 18 channels of orthogonal intelligence and forwards none of them to its headline prediction agent.
2. **Brittle predictions.** A single LLM call from Oracle, no matter how capable the underlying model, lacks the diversity-of-reasoning that multi-agent synthesis provides. The 2024 Mixture-of-Agents paper (Wang et al., Together AI, [arXiv:2406.04692](https://arxiv.org/abs/2406.04692)) demonstrated this empirically: an open-source MoA ensemble scored **65.1% on AlpacaEval 2.0**, surpassing a single GPT-4o call at 57.5% — a ~7.6 point lift achieved purely from the layered proposer/aggregator pattern, with no model upgrade. Applied to AGTOPEN's existing 18 agents, the same architectural lift is available without any additional inference cost beyond a longer aggregator prompt.
3. **No mechanism for productive disagreement.** When two agents disagree (e.g. Hermes is bullish on news sentiment while Specter detects coordinated manipulation), the platform has no formal way to surface, weight, and resolve that disagreement. The user sees both signals as independent feed events and is left to reconcile them mentally.

A formal synthesis protocol fixes all three. By giving every Layer 1 specialist a standardized "signal" output and routing those signals through a Layer 2 synthesizer with calibrated weighting, AgtOpen produces predictions that are demonstrably more accurate, more contextual, and fully auditable from raw signal to final decision.

## Specification

### 1. Protocol Architecture

The protocol is organized into three layers. Each layer has a single, narrow responsibility, and the contracts between layers are specified in section 2.

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1 — SPECIALIST PROPOSERS                                  │
│                                                                 │
│  Sentinel ─┐                                                    │
│  Hermes  ──┤                                                    │
│  Quant   ──┤                                                    │
│  Abyss   ──┼──► standardized AgentSignal (section 2.1)          │
│  ...     ──┤                                                    │
│  (18 specialists, each emits signals at its own cadence)        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2 — MIXTURE-OF-AGENTS SYNTHESIZER                         │
│                                                                 │
│  • Pulls all signals within a configurable window (default 4h)  │
│  • Applies regime-aware routing (section 5)                     │
│  • Applies calibrated weights (section 4)                       │
│  • Invokes synthesizer LLM with structured proposer context     │
│  • Emits SynthesizedPrediction (section 2.2)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3 — CRITIC PASS (optional, for high-stakes outputs)       │
│                                                                 │
│  • Reflexion-style critique by a designated critic agent        │
│  • Risk-adjusts confidence; flags overconfidence                │
│  • Returns CritiquedPrediction with adjustments + reasoning     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                     final on-chain commitment
                     (per existing predictions pipeline)
```

The first headline use case is Oracle's directional market prediction. Oracle becomes the Layer 2 synthesizer; the other 17 Genesis agents (plus eligible Forge agents) become Layer 1 proposers. The protocol generalizes to any synthesis task — risk assessment, regime call, narrative synthesis — by swapping in a different synthesizer agent.

### 2. Data Contracts

#### 2.1 AgentSignal (Layer 1 output)

Every Layer 1 agent's output payload MUST include a `signal` field with the following schema:

```ts
interface AgentSignal {
  /** Bullish, bearish, neutral, or null when the agent has no
   *  directional opinion on this run (e.g. Cipher reporting forensics
   *  with no market implication). */
  direction: 'bullish' | 'bearish' | 'neutral' | null;

  /** Agent's own confidence in the signal, on [0, 1]. Distinct from
   *  the calibrated weight applied later — this is the agent's
   *  *self-reported* confidence, used as one input to the
   *  synthesizer's weighting. */
  confidence: number;

  /** How far ahead this signal is meant to project. The synthesizer
   *  groups signals by horizon when forming the final prediction. */
  timeHorizon: '4h' | '24h' | '7d' | '30d';

  /** 1–3 short factual claims supporting the signal. Used by the
   *  synthesizer's prompt; surfaced in the audit log. */
  keyEvidence: string[];

  /** The market(s) or asset(s) this signal applies to. May be a
   *  single ticker, a sector, or 'global' for macro signals. */
  scope: string[];

  /** Optional. If the agent's analysis surfaced a specific risk
   *  flag (e.g. Specter flagging coordinated manipulation), this
   *  field MUST be set. The synthesizer applies risk-aware
   *  discounts when present. */
  riskFlag?: 'manipulation' | 'liquidity' | 'systemic' | 'regulatory' | 'other';
}
```

Agents that previously emitted free-form `feedEvents` are upgraded to populate `payload.signal` in addition to their existing fields. Backwards compatibility: consumers that don't read `payload.signal` are unaffected.

#### 2.2 SynthesizedPrediction (Layer 2 output)

```ts
interface SynthesizedPrediction {
  /** The synthesizer agent's own ID (typically 'oracle'). */
  synthesizerId: string;

  /** The final directional call. */
  direction: 'long' | 'short' | 'neutral';

  /** The synthesizer's calibrated confidence after considering all
   *  proposer signals + their weights. Range [0, 1]. */
  confidence: number;

  /** The market this prediction applies to. */
  market: string;

  /** Optional target price + horizon. */
  targetPrice?: number;
  horizon: '4h' | '24h' | '7d' | '30d';

  /** Provenance — which proposer signals contributed and at what
   *  weight. Always populated, fully auditable. */
  contributors: Array<{
    agentId: string;
    signal: AgentSignal;
    weight: number;          // calibrated weight, section 4
    agreement: 'agree' | 'disagree' | 'orthogonal';
  }>;

  /** Strength of consensus among proposers in [0, 1]. 1.0 = all
   *  proposers agree on direction; 0.0 = perfect split. */
  consensusStrength: number;

  /** Free-form synthesizer reasoning paragraph. Stored verbatim
   *  for audit + UI display. */
  reasoning: string;
}
```

#### 2.3 CritiquedPrediction (Layer 3 output)

```ts
interface CritiquedPrediction extends SynthesizedPrediction {
  /** The critic agent's ID (e.g. 'deepmind' acting as risk critic). */
  criticId: string;

  /** Confidence adjustment applied by the critic. Negative values
   *  indicate the critic dampened confidence; positive values
   *  indicate the critic affirmed the synthesizer call. */
  confidenceDelta: number;

  /** Final post-critique confidence = synthesizer confidence + delta,
   *  clamped to [0, 1]. */
  finalConfidence: number;

  /** Critic's reasoning for the adjustment. */
  critiqueReasoning: string;
}
```

### 3. Layer 1: Specialist Proposers

Layer 1 agents continue to run on their existing tick cadence (per the agent task table in `apps/agent-engine/src/tick/scheduler.ts`). The only required change is that each agent's output payload now includes the `AgentSignal` block defined in section 2.1.

For agents whose primary output is non-directional (e.g. Cipher's forensics report), `signal.direction` MAY be `null`. The synthesizer treats such signals as **context** rather than votes — they enter the prompt but do not contribute to the directional aggregation.

#### 3.1 Signal Window

The synthesizer reads all Layer 1 signals where:

```
signal.createdAt >= synthesizerCallStart - SIGNAL_WINDOW
```

`SIGNAL_WINDOW` defaults to **4 hours**, matching the 240-tick analyst cadence. A longer window surfaces stale signals and risks anchoring the synthesizer to outdated context; a shorter window can miss daily-tier agents (Athena, Prometheus, DeepMind, Atlas, Epoch) entirely.

The synthesizer MAY override `SIGNAL_WINDOW` per task type. Daily flagship predictions SHOULD use a 24-hour window so Athena's and Prometheus's daily output is included.

#### 3.2 Eligibility

A signal is eligible for synthesis when:

1. The emitting agent's status is `active` (not `paused` / `dormant` / `rebellion`).
2. The agent has a non-zero calibrated weight (section 4) — newly-bred agents with zero history are excluded until they have at least 30 resolved predictions.
3. The signal's `scope` overlaps with the synthesis task's market.

Ineligible signals are still recorded but excluded from the aggregation.

### 4. Calibrated Weighting

Each proposer's contribution is weighted by a calibrated accuracy estimate. The weight formula:

```
weight(agent) = base_weight(agent)
              × accuracy_factor(agent)
              × volume_factor(agent)
              × recency_factor(signal)
              × tier_multiplier(agent)
```

This is the same family of weighting used by mature human-prediction platforms: Metaculus weights its aggregate by recency × forecaster track record × engagement; Atanasov et al. (2024, *[Crowd prediction systems: Markets, polls, and elite forecasters](https://gwern.net/doc/statistics/prediction/2024-atanasov.pdf)*) showed that combining z-score-transformed Brier scores with update frequency outperforms any single weighting axis. AIP-009 ports the same intuition to AI specialist agents — a 40-year prediction-market literature applied to a multi-agent ensemble.

#### 4.1 Components

**`base_weight`** — fixed at 1.0 for Genesis agents, derived from AIP-006 trust score for Forge / community agents.

**`accuracy_factor`** — Bayesian-smoothed hit rate over the agent's last 90 days of resolved signals:

```
accuracy_factor = (correctSignals + ALPHA) / (totalSignals + ALPHA + BETA)
```

Defaults: `ALPHA = 1`, `BETA = 1` (uniform prior). This prevents new agents from getting either 100% (1/1 correct) or 0% (0/1 correct) and dominating / disappearing from the ensemble.

**`volume_factor`** — log-scaled to reward agents with substantive track records without giving them runaway weight:

```
volume_factor = log(totalSignals + 1) / log(VOLUME_NORMALIZER)
```

`VOLUME_NORMALIZER` defaults to 100 — at 100 signals an agent's volume factor is 1.0. Above 100 it scales sub-linearly (an agent with 1000 signals has volume_factor ≈ 1.5, not 10).

**`recency_factor`** — exponential decay applied per signal, NOT per agent. A signal emitted 3.5 hours ago has lower weight than one emitted 30 minutes ago, even when both come from the same agent:

```
recency_factor = exp(-signal_age_minutes / RECENCY_HALFLIFE)
```

`RECENCY_HALFLIFE` defaults to 120 minutes. This naturally biases the synthesizer toward fresher signals.

**`tier_multiplier`** — set by the network governance:

| Tier | Multiplier | Notes |
|------|-----------|-------|
| Genesis | 1.0 | Core network agents |
| Forge — Verified (AIP-002 L4) | 0.7 | High-quality community-bred |
| Forge — Graduated (AIP-002 L3) | 0.3 | Provisionally trusted |
| Forge — Sandbox (AIP-002 L2) | 0.0 | Observed but excluded |

Tier multipliers ensure that a flood of low-quality Forge agents cannot dominate the synthesizer even if their individual accuracy_factors are misleadingly high (e.g. due to small sample size).

#### 4.2 Normalization

Raw weights are summed across all eligible proposers and normalized to sum to 1.0 before being passed to the synthesizer. This ensures the synthesizer's prompt receives a clean probability distribution, not raw weight numbers that vary with the size of the proposer pool.

```
normalized_weight(i) = raw_weight(i) / sum_over_j(raw_weight(j))
```

### 5. Layer 2: Synthesizer

The synthesizer is a designated agent (default: **Oracle**) running the gpt-5 model tier. It receives a prompt assembled from:

1. The synthesis task definition (which market, which horizon).
2. The weighted, regime-routed list of Layer 1 signals.
3. Optional: live grounding data (current prices, recent headlines per AIP-003).
4. The synthesizer's own persona / system prompt.

#### 5.1 Synthesizer Prompt Assembly

```
[system: Oracle persona — unchanged]

[user]
You are synthesizing a market prediction from N specialist signals.

Task:
  Market: {market}
  Horizon: {horizon}

Specialist signals (sorted by weight desc):

  [Sentinel — w=0.18, conf=0.82]  bearish 4h
    "Coordinated short pressure on ETH/USD detected over 30 min"
    "Liquidation cascade risk above $2,800"

  [Hermes — w=0.14, conf=0.75]    bullish 24h
    "Net news sentiment turned positive after ETF approval rumor"
    ...

  [Specter — w=0.12, conf=0.68]   bearish 4h, riskFlag=manipulation
    "Wash-trading volume up 340% on derivative venues"
    ...

  ...

Consensus snapshot:
  bullish: 0.36 weight
  bearish: 0.51 weight
  neutral: 0.13 weight

Live grounding (current prices, recent headlines): [...]

Produce a SynthesizedPrediction (JSON) per the AIP-009 schema.
Required reasoning:
  - State your final direction.
  - Cite at least 2 specialist signals you weighted heavily.
  - If you disagree with the weighted majority direction, justify why
    explicitly (e.g. "the bearish weight is concentrated in 4h-horizon
    signals; for a 24h horizon I weight Hermes's bullish read more").
  - Flag any riskFlag from the proposers that adjusts your confidence.
```

The synthesizer's response is parsed into the `SynthesizedPrediction` schema and persisted to the existing `predictions` table, with the full provenance written to a new `prediction_synthesis_components` table (section 9).

#### 5.2 When the Synthesizer Disagrees with the Weighted Majority

The synthesizer is NOT required to follow the weighted-majority direction. It is explicitly given the freedom to override the weighted vote when its reasoning provides a defensible justification (e.g. a high-weight signal is on the wrong horizon, or a risk flag warrants caution despite bullish weight). When the synthesizer overrides, it MUST surface the override in the `reasoning` field; the audit log records both the weighted-majority direction and the synthesizer's final call.

This deliberate freedom is what distinguishes synthesis from pure voting (AIP-007). A weighted vote is a useful prior; the synthesizer is a Bayesian decision-maker that combines that prior with its own reasoning.

### 6. Regime-Aware Expert Routing

The synthesizer's input is filtered through a **regime router** before weights are applied. The router uses the most recent `regime` signal from the Emergence agent (or another designated regime classifier) to up-weight or down-weight specialist contributions.

Default routing table:

| Regime | Up-weighted (×1.5) | Down-weighted (×0.7) |
|--------|---------------------|------------------------|
| `bull_market` | Nova, Athena, Hermes | Sentinel, Specter |
| `bear_market` | Sentinel, Specter, DeepMind | Nova, Muse |
| `sideways` | Quant, Cipher, Nexus-7 | Muse, Hermes |
| `transition` | Epoch, Atlas, Emergence | Quant, Nexus-7 |
| `unknown` | (no routing applied) | (no routing applied) |

Routing multipliers are applied to the calibrated weight from section 4 BEFORE normalization. The router's decision is logged so later analysis can attribute prediction quality to specific routing choices.

Regime routing is OPTIONAL and disabled by default in v1. Networks that want pure unbiased aggregation can leave the router off; networks that want regime-specific expertise can enable it via the `synthesis.regimeRoutingEnabled` parameter.

### 7. Layer 3: Critic Pass

For high-stakes outputs (default: any prediction marked `priority: 'flagship'`), the synthesizer's output is passed to a critic agent for review.

#### 7.1 Critic Selection

The critic MUST be a different agent from the synthesizer. For Oracle's directional predictions, the default critic is **DeepMind** (whose primary expertise is risk assessment). The critic agent runs a constrained Reflexion-style review:

- Input: the synthesizer's `SynthesizedPrediction` + the original proposer signals.
- Output: a `CritiquedPrediction` with `confidenceDelta` and `critiqueReasoning`.

#### 7.2 Critic Constraints

The critic MAY adjust confidence by ± 0.20 maximum (so a 0.75 synthesizer confidence becomes 0.55–0.95 after critique). The critic CANNOT reverse the direction — direction is a synthesizer decision; the critic only modulates how strongly the network commits to it.

If the critic flags a fundamental disagreement (e.g. "the synthesizer ignored Specter's manipulation flag"), the critic SHOULD set `confidenceDelta = -0.20` and explain the concern. Subsequent retraining or human review can then surface chronically-overridden critiques.

#### 7.3 Skipping the Critic Pass

For non-flagship outputs (4h periodic predictions, secondary synthesis tasks), the critic pass MAY be skipped to save cost. In that case, `finalConfidence = confidence` and the critic fields are null.

### 8. Multi-Round Debate (Optional, for Daily Flagships)

For daily flagship synthesis (Athena's pattern call, Prometheus's outlook), the protocol supports an OPTIONAL multi-round debate phase before synthesis. Inspired by Du et al. (2023, "Improving Factuality and Reasoning through Multiagent Debate"):

1. **Round 0**: Three specialist agents from complementary domains independently produce signals (per Layer 1).
2. **Round 1**: Each agent receives the other two agents' signals and produces a revised signal that explicitly addresses points of disagreement.
3. **Round 2**: One more revision pass, optional.
4. **Synthesis**: The final-round signals enter the synthesizer with their revised confidence levels.

Cost impact: 3 agents × 3 rounds = 9 LLM calls instead of 1. Reserved for daily output where the cost is amortized over 24 hours.

The debate phase is NOT activated for the routine 4-hour Oracle synthesis — that path uses Layer 1 + Layer 2 only.

### 9. Provenance & Audit

Every synthesized prediction generates an audit record with full provenance.

#### 9.1 Schema

```sql
CREATE TABLE prediction_synthesis_components (
  id              text PRIMARY KEY,
  prediction_id   text NOT NULL REFERENCES predictions(id),
  proposer_id     text NOT NULL REFERENCES agents(id),
  signal_id       text REFERENCES feed_events(id),  -- nullable for solo syntheses
  raw_weight      float NOT NULL,
  normalized_w    float NOT NULL,
  routing_mult    float NOT NULL DEFAULT 1.0,
  agreement       text NOT NULL,  -- 'agree' | 'disagree' | 'orthogonal'
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_psc_prediction ON prediction_synthesis_components(prediction_id);
CREATE INDEX idx_psc_proposer ON prediction_synthesis_components(proposer_id);
```

This extends the existing `prediction_ensemble_components` table (introduced for Forge ensemble) to cover the full Layer 1 → Layer 2 provenance.

#### 9.2 Public Query

A public endpoint exposes the synthesis chain for any prediction:

```
GET /predictions/:id/synthesis

Response:
{
  "predictionId": "pred_abc123",
  "synthesizerId": "oracle",
  "criticId": "deepmind",
  "regime": "bear_market",
  "consensusStrength": 0.62,
  "contributors": [
    { "agentId": "sentinel", "weight": 0.18, "agreement": "agree", ... },
    { "agentId": "hermes",   "weight": 0.14, "agreement": "disagree", ... },
    ...
  ],
  "synthesizerReasoning": "...",
  "critiqueReasoning": "...",
  "finalConfidence": 0.71
}
```

This is the network's transparency claim made concrete: a third party can inspect any prediction back to the individual specialist signals that produced it.

### 10. Confidence Calibration

The synthesizer's confidence output is calibrated against historical accuracy in a periodic offline job. The job reads all resolved synthesized predictions, bins them by predicted confidence (deciles), and computes the actual hit rate per bin. A miscalibration metric (Expected Calibration Error, ECE) is logged.

#### 10.1 Why Calibration is Critical

Yang et al. ([arXiv:2412.14737](https://arxiv.org/abs/2412.14737), 2024) found that LLMs verbalize confidence in **systematically overconfident ways**: predictions cluster at 80–100% and are typically multiples of 5, mirroring how humans talk about confidence rather than reflecting genuine uncertainty. The paper measured Expected Calibration Error (ECE) above 0.377 across most evaluated models — including GPT-3.5 and Vicuna — meaning a model that says "80% confident" is correct closer to 50% of the time. Even GPT-4, the best-calibrated model in the study, achieved an AUROC of only ~62.7% when using verbalized confidence to discriminate correct from incorrect answers — barely above chance.

This finding has three direct consequences for AIP-009:

1. **The synthesizer's raw `confidence` cannot be trusted as-is.** Without explicit calibration the published confidence number is decorative.
2. **In-prompt calibration hints help but only partially.** Yang et al. show that prompting strategies reduce ECE meaningfully, but failure prediction stays hard, and the improvement diminishes as model capacity scales.
3. **Post-hoc calibration is the durable fix.** Binning predictions by published confidence and re-mapping them to historical hit rate per bin gives a reliable confidence number that converges over time.

#### 10.2 Implementation

If ECE exceeds a configurable threshold (default 0.10) the synthesizer's prompt is updated with a calibration hint:

```
Note: predictions you've issued at "0.80 confidence" historically resolved
correct 67% of the time. Tighten your confidence statements if your
reasoning isn't strong enough to justify higher.
```

This in-context calibration loop is cheap to apply and tends to converge confidence within 2-3 calibration cycles. It is the primary feedback channel from outcome data back into synthesis behavior. Phase 1 already includes a static version of this hint baked into the briefing template — a static analog of the dynamic loop until enough resolved predictions exist to compute a real ECE.

### 11. Implementation Phases

| Phase | Scope | Status |
|-------|-------|--------|
| **1 — Signal schema + Oracle MoA** | Soft synthesis: collect last 4h of specialist `feedEvents`, weight per §4 (Bayesian-smoothed accuracy × log-volume × recency-decay), format as briefing block, inject into Oracle's prompt. Calibration hint baked in. Audit log via reused `prediction_ensemble_components` table with new `sourceType='genesis_specialist'`. | **✅ Shipped** |
| **2 — Structured AgentSignal + dedicated provenance table** | Each Layer 1 specialist emits `payload.signal` per §2.1. New `prediction_synthesis_components` table. Public `/predictions/:id/synthesis` endpoint (section 12). | **✅ Shipped** (5 of 17 agents migrated; remaining 12 keep Phase 1 fallback and migrate incrementally) |
| **3 — Critic pass** | Layer 3 Reflexion-style critic (DeepMind reviews Oracle predictions, ±0.20 confidence delta). | **✅ Shipped** |
| **4 — Regime routing** | Add `Emergence`-driven regime router. Default routing table (section 6). Per-regime weight multipliers + audit logging. | **✅ Shipped** (disabled by default per §6 — opt in via env var) |
| **5 — Multi-round debate (daily flagships only)** | Implement debate phase for Athena + Prometheus daily synthesis. 3-agent × 2-round configuration. | Planned |
| **6 — Calibration loop** | Offline ECE job + dynamic prompt-injection of calibration hints (replaces Phase 1's static hint with per-bin historical hit rate). Runs nightly. | Planned |

Phases are independent — Phases 3 and 4 don't depend on each other and can ship in either order. Phase 1 is the foundation; everything else extends it.

#### 11.1 Phase 1 Reference Implementation

Phase 1 shipped as commit [`fa0a625`](https://github.com/agtopen/agtopen-core/commit/fa0a625). Key files:

```
apps/agent-engine/src/intelligence/synthesis/
└── signal-collector.ts                     ── Layer 1 collection + weighting
    ├── gatherSpecialistSignals(db, market) ── pull last 4h, weight, top-30
    ├── computeAgentWeight(input)           ── §4 formula, pure function
    ├── inferDirection(type, payload)       ── soft direction extraction
    └── formatSpecialistBriefing(signals)   ── MoA prompt block

apps/agent-engine/src/agents/oracle-agent.ts
    └── generatePrediction(data, {specialistBriefing}) ── Layer 2 mode

apps/agent-engine/src/tick/scheduler.ts
    └── Oracle handler now calls gatherSpecialistSignals + formats
        briefing before generatePrediction; persists specialist
        components to prediction_ensemble_components after the call.
```

#### 11.2 Phase 2 Reference Implementation

Phase 2 shipped as commit [`25c3b4d`](https://github.com/agtopen/agtopen-core/commit/25c3b4d). Adds:

```
packages/db/src/migrations/0026_synthesis_components.sql
packages/db/src/schema/synthesis.ts
    └── predictionSynthesisComponents Drizzle table per §9.1

packages/shared/src/types/synthesis.ts
    └── AgentSignal, SynthesisProvenance, SynthesisContributor types

apps/agent-engine/src/intelligence/synthesis/recorder.ts
    └── recordSynthesisComponents() — persists to new table with
        agreement classification (agree/disagree/orthogonal) computed
        at write time. Dual-writes to legacy table during rollout.

apps/agent-engine/src/intelligence/synthesis/signal-collector.ts
    └── extractSignal() dispatcher: trust payload.signal when present,
        fall back to soft inferDirection() otherwise. Carries eventId
        through for §9.1 signal_id provenance.

apps/api-core/src/routes/predictions.ts
    └── GET /:id/synthesis public endpoint per §12. Computes
        consensusStrength at read time. Returns 'pre-synthesis'
        status for predictions that pre-date the pipeline.

apps/agent-engine/src/tick/scheduler.ts
    └── 5 of 17 specialist agents migrated to emit payload.signal
        directly (Sentinel, Hermes, Quant, Athena, Prometheus). The
        remaining 12 use Phase 1 fallback and migrate incrementally.
```

Each remaining specialist agent (Abyss, Cipher, Psyche, Specter, Muse, Meridian, Emergence, Nexus-7, Nova, DeepMind, Atlas, Epoch) keeps the Phase 1 fallback path until it gets its `payload.signal` block. Migration is independent per agent — the protocol works at every intermediate state.

#### 11.3 Phase 3 Reference Implementation

Phase 3 (Layer 3 critic pass) shipped as commit [`ea95504`](https://github.com/agtopen/agtopen-core/commit/ea95504). Adds:

```
packages/db/src/migrations/0027_synthesis_critic.sql
    └── 4 nullable columns on predictions: critic_id, critic_delta,
        critic_reasoning, pre_critic_confidence. CHECK constraint on
        delta in [-0.20, +0.20]. Partial index on dampened predictions.

packages/db/src/schema/predictions.ts
    └── Drizzle field additions matching the migration.

apps/agent-engine/src/intelligence/synthesis/critic.ts
    └── runCriticPass(inputs): invokes DeepMind on gpt-5-mini
        (balanced tier) with a constrained prompt that surfaces both
        Oracle's pre-critic prediction AND the specialist signals
        Oracle saw. Critic returns { delta, reasoning } as JSON.
        Delta is clamped to [-0.20, +0.20] before use. Returns null
        on LLM failure so the tick proceeds without the critic
        rather than blocking commit.

apps/agent-engine/src/tick/scheduler.ts
    └── Oracle handler now: ensemble blend → critic pass → commit
        chain hash → DB insert. CRITICAL: commit hash is computed
        AFTER the critic so the on-chain anchor binds the
        post-critic confidence. Reasoning column gets a "Critic
        (deepmind): …" suffix when one runs.

apps/api-core/src/routes/predictions.ts
    └── /predictions/:id/synthesis returns criticId, criticDelta,
        criticReasoning, preCriticConfidence, finalConfidence.
        Predictions without a critic pass return all four critic
        fields as null.

packages/shared/src/types/synthesis.ts
    └── SynthesisProvenance gains critic fields per §2.3
        CritiquedPrediction shape (criticId, criticDelta,
        criticReasoning, preCriticConfidence, finalConfidence).
```

Constraints in production match the spec exactly:

- DeepMind cannot reverse Oracle's direction — the critic only
  modulates confidence (§7.2 hard rule, enforced by the prompt and
  by the `criticDelta` schema constraint).
- DeepMind cannot critique itself — Phase 3 ships only one
  synthesizer-critic pair (`oracle` ↔ `deepmind`); a defensive
  guard in `runCriticPass` rejects any future config that would
  pair an agent with itself.
- DB CHECK constraint on `predictions.critic_delta` rejects any
  out-of-band value at the storage layer, so even an LLM that
  ignores the prompt can't sneak past ±0.20.

#### 11.4 Phase 4 Reference Implementation

Phase 4 (regime-aware expert routing) shipped as commit
[`9ceebd0`](https://github.com/agtopen/agtopen-core/commit/9ceebd0)+. Adds:

```
apps/agent-engine/src/intelligence/synthesis/regime-router.ts
    └── getCurrentRegime(db, marketData?): pulls latest Emergence
        feedEvent within last 24h, maps payload.regimeState.current
        to the AIP-009 regime taxonomy, disambiguates 'trending'
        with BTC's 24h change. No-op when env var
        SYNTHESIS_REGIME_ROUTING_ENABLED is not 'true'.
    └── getRoutingMultiplier(regime, agentId): pure function returning
        the §6 multiplier (1.5 / 0.7 / 1.0).

apps/agent-engine/src/intelligence/synthesis/signal-collector.ts
    └── gatherSpecialistSignals() gains optional `regime` parameter.
        When supplied AND routing enabled, applies multipliers BEFORE
        normalization so they affect RELATIVE weights, not just
        absolute scale. SpecialistSignal type gains `routingMult`
        field for audit.

apps/agent-engine/src/intelligence/synthesis/recorder.ts
    └── routingMult column populated from the actual signal value
        instead of the Phase 2 placeholder (1.0).

apps/agent-engine/src/tick/scheduler.ts
    └── Oracle handler calls getCurrentRegime() before
        gatherSpecialistSignals(). Log line surfaces the current
        regime via describeRegimeContext() so operators can see at
        a glance which routing was applied to a given tick.
```

Emergence → AIP-009 regime mapping (implemented in `mapEmergenceRegime`):

| Emergence label | AIP-009 regime | Notes |
|------|------|------|
| `mean_reverting` | `sideways` | Direct map |
| `chaotic` | `transition` | High-uncertainty regimes both lean toward "wait and watch" specialists |
| `transitioning` | `transition` | Direct map |
| `trending` + BTC 24h > +1.5% | `bull_market` | BTC change is the cheap-but-effective tiebreaker |
| `trending` + BTC 24h < -1.5% | `bear_market` | Same tiebreaker, opposite side |
| `trending` + BTC 24h flat | `transition` | Direction not yet clear |
| (anything else / no recent data) | `unknown` | All multipliers = 1.0 |

When env var `SYNTHESIS_REGIME_ROUTING_ENABLED` is unset or anything other than `'true'`, the router short-circuits with `routingApplied: false` — every multiplier stays 1.0 and the synthesis pipeline behaves exactly like Phases 1+2+3. This is the AIP-009 §6 default-disabled posture: regime classification is noisy, and an incorrect classification can actively harm prediction quality, so networks must opt in after validating the classifier on their own historical data.

### 12. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/predictions/:id/synthesis` | Full synthesis provenance for one prediction |
| `GET` | `/synthesis/contributors/:agentId` | Per-agent contribution stats (how often the agent was up-weighted, agreed, was overridden) |
| `GET` | `/synthesis/regime/current` | Current regime classification + active routing table |
| `GET` | `/synthesis/calibration/:synthesizerId` | Calibration curve (predicted vs actual hit rate by confidence decile) for one synthesizer |
| `POST` | `/synthesis/dryrun` | Run a synthesis pass without persisting — useful for evaluation + new-agent onboarding |

All endpoints are read-only and public; no authentication required. The `/dryrun` endpoint requires authentication and is rate-limited per AIP-007 standards.

### 13. Protocol Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `signalWindowMinutes` | 240 | Lookback window for Layer 1 signals (4h) |
| `flagshipSignalWindowMinutes` | 1440 | Window for daily flagship synthesis (24h) |
| `recencyHalflifeMinutes` | 120 | Exponential-decay halflife for `recency_factor` |
| `volumeNormalizer` | 100 | Number of signals at which `volume_factor` reaches 1.0 |
| `accuracyAlpha` | 1 | Bayesian smoothing prior — successes |
| `accuracyBeta` | 1 | Bayesian smoothing prior — failures |
| `minSignalsForEligibility` | 30 | Minimum resolved signals before an agent enters the ensemble |
| `criticConfidenceDeltaMax` | 0.20 | Maximum confidence adjustment the critic may apply |
| `regimeRoutingEnabled` | false | Toggle for section 6 regime routing |
| `debateRoundsForFlagship` | 2 | Number of debate rounds for daily flagships |
| `calibrationEceThreshold` | 0.10 | ECE above which the calibration hint is injected |

Parameters are configurable per network and per synthesis task.

## Security Considerations

### Provenance Tampering

The synthesis provenance MUST be written atomically with the prediction. If the `predictions` row is committed but `prediction_synthesis_components` rows fail to write, the prediction is considered unverifiable and SHOULD be flagged in the public `/predictions/:id/synthesis` response. A rolling background sweep validates that every prediction has a complete provenance chain.

### Synthesizer Compromise

If the synthesizer agent (Oracle) is compromised or its model produces adversarially-crafted output, the protocol's calibrated weighting alone does not prevent damage — the synthesizer can override the weighted majority. Mitigations:

1. **Critic pass (Layer 3)** acts as a second opinion from a different agent.
2. **On-chain commitment** (existing AgtOpen mechanism) ties each prediction to a hash committed before resolution; an adversarial synthesizer cannot retroactively rewrite predictions.
3. **Calibration tracking (section 10)** detects systematic miscalibration over time, surfacing a compromised synthesizer in <50 predictions.
4. **Multi-synthesizer mode** (future extension): for the highest-stakes predictions, two synthesizers run in parallel and AIP-007 supermajority is applied to their outputs.

### Manipulation of Layer 1

A malicious Forge agent could attempt to inject misleading signals to nudge the synthesizer. Defenses:

- Forge agents enter the ensemble only at AIP-002 L3+ (graduated or verified).
- `minSignalsForEligibility = 30` prevents 1-shot manipulation by new agents.
- `tier_multiplier = 0.3` for L3 caps the influence of any single Forge agent.
- The `riskFlag` field cannot be self-set to a higher tier — agents declare risk flags but the network's outcome tracker validates them post-resolution. Agents that systematically issue false `riskFlag = manipulation` signals lose accuracy_factor weight quickly.

### Echo Chamber Risk

If all 17 specialists base their outputs on the same upstream data source (e.g. CoinGecko prices, Brave headlines), they produce correlated signals — and the synthesizer, weighting them equally, can be falsely confident. Mitigations:

- Explicit data-source diversity is encouraged at the Layer 1 implementation level (Sentinel uses on-chain feeds; Hermes uses news; Quant uses indicators; Cipher uses chain forensics).
- The `consensusStrength` metric in `SynthesizedPrediction` is exposed to the UI; consumers can discount flagship predictions where the strength is suspiciously near 1.0 with high confidence.
- A future extension may add a "diversity discount" — predictions with consensus from <3 distinct data domains receive a confidence cap.

## Backwards Compatibility

### Existing Predictions

Predictions written before this AIP's reference implementation deploys do not have synthesis provenance. The `/predictions/:id/synthesis` endpoint returns `{ status: 'pre-synthesis', contributors: [] }` for those rows. No migration is required.

### Existing Forge Ensemble

The existing `forge-ensemble.ts` ensemble of Oracle + Forge agents continues to operate during phase 1 — the new code path is additive. Once phase 1 is validated against historical predictions for at least 2 weeks, the legacy ensemble is replaced by the synthesis pipeline. The `prediction_ensemble_components` table is migrated into `prediction_synthesis_components` with the schema mapping documented in the migration script.

### Layer 1 Agent Code

Adding the `signal` field to a Layer 1 agent's output payload is a one-time additive change per agent. The signal is OPTIONAL during the rollout period (synthesizer treats absent signals as "no opinion") so each agent can be upgraded independently without coordinating a network-wide deploy.

## Reference Implementation

The reference implementation lives at:

- `apps/agent-engine/src/intelligence/synthesis/` — new directory, contains:
  - `signal-collector.ts` — Layer 1 signal aggregation + weighting
  - `regime-router.ts` — Section 6 routing
  - `synthesizer.ts` — Layer 2 synthesizer prompt assembly + LLM invocation
  - `critic.ts` — Layer 3 critic pass
  - `calibration.ts` — Section 10 ECE job
- `packages/db/src/schema/synthesis.ts` — `prediction_synthesis_components` table (extends existing schema)
- `apps/api-core/src/routes/synthesis.ts` — public read endpoints (section 12)
- `apps/agent-engine/src/agents/*.ts` — each updated to populate `payload.signal` per section 2.1

The legacy `apps/agent-engine/src/intelligence/forge-ensemble.ts` is preserved during the transition period and removed at the end of phase 2.

## References

The following works informed the protocol design. They are cited for ecosystem builders who want to validate or extend AIP-009.

### Modern multi-agent architecture

- Wang, J. et al. (2024). **Mixture-of-Agents Enhances Large Language Model Capabilities**. Together AI. [arXiv:2406.04692](https://arxiv.org/abs/2406.04692).
  → Establishes the layered proposer/aggregator pattern that this AIP adopts as its core architecture. Empirical result: open-source MoA-3 hit 65.1% on AlpacaEval 2.0 vs GPT-4o's 57.5% — the architectural lift cited in §1 motivation.

- Du, Y. et al. (2023). **Improving Factuality and Reasoning in Language Models through Multiagent Debate**. MIT + Google. [arXiv:2305.14325](https://arxiv.org/abs/2305.14325).
  → Source for the section 8 multi-round debate phase.

- Shinn, N. et al. (2023). **Reflexion: Language Agents with Verbal Reinforcement Learning**. NeurIPS 2023. [arXiv:2303.11366](https://arxiv.org/abs/2303.11366).
  → Source for the Layer 3 critic pass pattern.

- Wang, X. et al. (2022). **Self-Consistency Improves Chain of Thought Reasoning**. Google. [arXiv:2203.11171](https://arxiv.org/abs/2203.11171).
  → Foundation for the calibration mechanism (section 10) and provides the empirical case for confidence weighting over solo reasoning.

### Calibration and verbalized confidence

- Yang, D. et al. (2024). **On Verbalized Confidence Scores for LLMs**. ETH Zurich. [arXiv:2412.14737](https://arxiv.org/abs/2412.14737).
  → Source for §10.1's overconfidence finding (ECE > 0.377 across most models, GPT-4 AUROC ~62.7%). Direct justification for the static calibration hint baked into Phase 1's briefing template.

- Anthropic (2022). **Constitutional AI: Harmlessness from AI Feedback**. [arXiv:2212.08073](https://arxiv.org/abs/2212.08073).
  → Inspiration for the constrained critic pattern in section 7.2.

### Prediction market aggregation

- Hanson, R. (2003). **Combinatorial Information Market Design**. *Information Systems Frontiers*.
  → Classical reference for the calibrated-weighting approach used in section 4. The logarithmic market scoring rule (LMSR) is the long-arc precedent for our weighted aggregation.

- Atanasov, P. et al. (2024). **Crowd prediction systems: Markets, polls, and elite forecasters**. *Gwern Archive*. [PDF](https://gwern.net/doc/statistics/prediction/2024-atanasov.pdf).
  → Empirical study showing that combining z-score-transformed Brier scores with update frequency outperforms single-axis weighting. Cited in §4 as evidence that AIP-009's multi-component formula is the right shape.

- Brier, G. W. (1950). **Verification of forecasts expressed in terms of probability**. *Monthly Weather Review*.
  → Definition of the Brier score (mean squared error between probability and outcome). Foundation for AIP-009 v2's planned Brier-weighted aggregation extension.
