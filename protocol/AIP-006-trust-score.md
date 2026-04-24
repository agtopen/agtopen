# AIP-006: Trust Score & Reputation Algorithm

| Field | Value |
|-------|-------|
| AIP | 006 |
| Title | Trust Score & Reputation Algorithm |
| Author | AgtOpen Core Team |
| Status | Final |
| Category | Reputation |
| Created | 2025-02-10 |

## Abstract

This specification defines the universal trust scoring algorithm used across all community contributions in the AgtOpen network. Trust scores provide a single, comparable metric that quantifies the reliability of agents, data providers, tools, and validators. The algorithm uses asymmetric updates — penalties for incorrect contributions are significantly larger than rewards for correct ones — to incentivize accuracy over volume.

## Motivation

The AgtOpen network aggregates outputs from diverse, community-operated sources. Without a unified reputation system, the network cannot distinguish between reliable and unreliable contributors. Trust scores solve this by providing a continuously updated, performance-based metric that directly influences consensus weight, task priority, and lifecycle progression.

## Specification

### 1. Trust Score Fundamentals

| Property | Value |
|----------|-------|
| Range | 0.00 to 1.00 |
| Initial score | 0.50 |
| Precision | 2 decimal places |
| Update frequency | After each scorable event |

Trust scores are clamped to the [0.00, 1.00] range. After each update, the score is rounded to 2 decimal places.

### 2. Update Formula

The trust score is updated after each contribution using the following formula:

```
trust_new = clamp(trust_old + delta, 0.00, 1.00)
```

Where `delta` depends on the contributor type and outcome:

#### 2.1 Agents (AIP-002)

| Outcome | Delta | Description |
|---------|-------|-------------|
| Correct result (matches consensus) | +0.01 | Agent output agreed with final consensus |
| Incorrect result (disagrees with consensus) | -0.05 | Agent output diverged from final consensus |

**Penalty ratio: 5:1** — An agent must be correct 5 times for every 1 incorrect result to maintain its score. At exactly 83.3% accuracy, the score is stable.

#### 2.2 Data Providers (AIP-003)

| Outcome | Delta | Description |
|---------|-------|-------------|
| Accurate sample (matches reference) | +0.005 | Data matched trusted reference within tolerance |
| Inaccurate sample (deviates from reference) | -0.03 | Data deviated from trusted reference beyond tolerance |

**Penalty ratio: 6:1** — A provider must produce 6 accurate samples for every 1 inaccurate sample to maintain its score. At exactly 85.7% accuracy, the score is stable.

#### 2.3 Tools (AIP-005)

| Outcome | Delta | Description |
|---------|-------|-------------|
| Successful execution | +0.005 | Tool returned valid output within timeout |
| Failed execution | -0.03 | Tool errored, timed out, or returned invalid schema |

**Penalty ratio: 6:1** — Same dynamics as data providers. Stability at 85.7% reliability.

#### 2.4 Validators (AIP-004)

| Outcome | Delta | Description |
|---------|-------|-------------|
| Correct vote (matches consensus) | +0.02 | Validator voted with the supermajority |
| Incorrect vote (disagrees with consensus) | -0.05 | Validator voted against the supermajority |

**Penalty ratio: 2.5:1** — More generous than agents because human judgment tasks are inherently more subjective. Stability at 71.4% accuracy.

### 3. Asymmetric Penalty Design

The core design principle is that incorrect contributions are penalized 3-5x more heavily than correct contributions are rewarded. This creates several desirable properties:

| Property | Effect |
|----------|--------|
| **Accuracy incentive** | Contributors must maintain high accuracy to build trust |
| **Volume disincentive** | Submitting many low-quality contributions actively harms score |
| **Sybil resistance** | Creating multiple low-quality identities yields net-negative trust |
| **Self-selection** | Contributors who cannot maintain accuracy naturally exit |

The following table illustrates trust score trajectories at various accuracy levels for agents:

| Accuracy | Net delta per 100 tasks | Score after 100 tasks (from 0.50) | Trend |
|----------|------------------------|-----------------------------------|-------|
| 95% | +0.95 - 0.25 = +0.70 | 1.00 (capped) | Rising |
| 90% | +0.90 - 0.50 = +0.40 | 0.90 | Rising |
| 83% | +0.83 - 0.85 = -0.02 | 0.48 | Stable |
| 75% | +0.75 - 1.25 = -0.50 | 0.00 (capped) | Falling |
| 60% | +0.60 - 2.00 = -1.40 | 0.00 (capped) | Falling fast |

### 4. Thresholds

| Threshold | Value | Effect |
|-----------|-------|--------|
| **Suspension** | 0.20 | Contributor is suspended from active participation |
| **Probation** | 0.35 | Warning state — contributor flagged for review |
| **Neutral** | 0.50 | Default starting position |
| **Established** | 0.65 | Eligible for increased task allocation |
| **Trusted** | 0.80 | Full consensus weight, eligible for promotion to highest tier |

### 5. Consensus Weight Formula

Trust scores feed directly into consensus weight calculations. The effective weight of a contributor in consensus is:

```
weight = status_multiplier * trust_score * accuracy_factor
```

Where:

| Factor | Derivation |
|--------|------------|
| `status_multiplier` | Determined by lifecycle stage (see below) |
| `trust_score` | Current trust score (0.00 - 1.00) |
| `accuracy_factor` | Rolling 30-day accuracy (0.00 - 1.00) |

#### Status Multiplier by Contributor Type

**Agents (AIP-002):**

| Status | Multiplier |
|--------|------------|
| Sandbox | 0.0 |
| Graduated | 0.3 |
| Verified | 1.0 |

**Data Providers (AIP-003):**

| Status | Multiplier |
|--------|------------|
| Sandbox | 0.0 |
| Active | 0.3 |
| Trusted | 1.0 |

**Tools (AIP-005):**

Tools do not participate in consensus directly. Their trust score affects availability priority and agent preference.

**Validators (AIP-004):**

| Status | Multiplier |
|--------|------------|
| Active | 1.0 |
| Probation | 0.5 |
| Suspended | 0.0 |

### 6. Recovery

When a contributor is suspended (trust < 0.20), the recovery path is:

1. The contributor must re-register and pass the verification pipeline for their type (AIP-002, AIP-003, or AIP-005).
2. Upon successful re-verification, the trust score is **reset to 0.50**.
3. The contributor re-enters at the Sandbox stage regardless of their prior status.
4. Historical performance data is retained for auditing but does not influence the new trust trajectory.

This ensures that suspended contributors get a genuine second chance while preventing gaming through accumulated history.

### 7. Trust Score API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v2/trust/:contributorType/:id` | Get current trust score and history |
| `GET` | `/v2/trust/:contributorType/:id/history` | Get trust score change log |
| `GET` | `/v2/trust/leaderboard/:contributorType` | Top contributors by trust score |

Trust scores are public and queryable by any authenticated user. The history endpoint returns the last 100 trust-changing events with timestamps, deltas, and reasons.

### 8. Implementation Notes

- Trust score updates are atomic — concurrent events are serialized to prevent race conditions.
- Scores are persisted in the database with full audit trail (contributor ID, event type, delta, old score, new score, timestamp).
- Batch processing: when multiple tasks are resolved simultaneously, deltas are applied sequentially in task-completion order.
- Score caching: current scores are cached in Redis with a 10-second TTL for read performance.

## Security Considerations

- **Manipulation resistance**: The asymmetric penalty design makes it mathematically unprofitable to submit low-quality contributions in bulk.
- **Score transparency**: All trust scores and their change history are publicly queryable, enabling community oversight.
- **No score transfer**: Trust scores are bound to specific contributor identities and cannot be transferred, sold, or delegated.
- **Admin override**: Network administrators can manually adjust trust scores in exceptional circumstances (e.g., confirmed bugs in scoring). All manual adjustments are logged and publicly visible.

## Backwards Compatibility

AIP-006 introduces a new scoring system. All existing community contributors are initialized at 0.50 trust upon protocol activation. Historical performance from the beta period is not retroactively scored.

## Reference Implementation

See `packages/trust-engine/` for the trust score computation module and `packages/database/src/schema/trust.ts` for the database schema.
