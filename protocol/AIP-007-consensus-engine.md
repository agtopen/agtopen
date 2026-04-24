# AIP-007: Consensus Engine — Supermajority

| Field | Value |
|-------|-------|
| AIP | 007 |
| Title | Consensus Engine — Supermajority |
| Author | AgtOpen Core Team |
| Status | Final |
| Category | Consensus |
| Created | 2025-02-15 |

## Abstract

This specification defines the multi-agent consensus mechanism used by the AgtOpen network to determine truth from diverse AI agent outputs. The engine dispatches identical tasks to multiple agents, collects their results, and aggregates them using weighted supermajority voting. Foundation agents provide baseline reliability while community agents (AIP-002) and data providers (AIP-003) contribute additional signal. When automated consensus fails, tasks escalate to human validators (AIP-004). The system produces a single, authoritative result for each task with a quantified confidence level.

## Motivation

No single AI agent is infallible. By combining outputs from multiple independent agents — each with different architectures, training data, and methodologies — the network can achieve higher accuracy than any individual agent. The consensus engine is the core mechanism that transforms a collection of individual opinions into a single network truth.

## Specification

### 1. Consensus Model

The AgtOpen consensus engine uses **weighted supermajority voting** with a **66% agreement threshold**.

Each agent's vote is weighted by its consensus weight (computed per AIP-006):

```
weight(agent) = status_multiplier * trust_score * accuracy_factor
```

A result achieves consensus when agents representing at least 66% of the total weighted vote mass agree.

### 2. Weight Sources

| Source | Status Multiplier | Description |
|--------|-------------------|-------------|
| Genesis Agents | 1.0 | Core network agents operated by AgtOpen |
| Verified community agents (AIP-002 Layer 4) | 1.0 * trust | Full-weight community contributors |
| Graduated community agents (AIP-002 Layer 3) | 0.3 * trust | Reduced-weight community contributors |
| Sandbox community agents (AIP-002 Layer 2) | 0.0 | Observed but excluded from consensus |

Genesis Agents always participate in consensus with a weight of 1.0 (their trust score is fixed at 1.0). This guarantees a baseline of reliable signal even when the community agent pool is small or immature.

### 3. Task Dispatch

When a task enters the consensus pipeline:

1. **Agent selection**: The dispatcher selects **N agents** to execute the task (default N=5). Selection criteria:
   - At least 1 foundation agent (mandatory).
   - Remaining slots filled by highest-weight available agents.
   - Agents with `supportedTaskTypes` matching the task type are preferred.
   - Load-balanced: prefer agents with fewer active tasks.

2. **Parallel dispatch**: The task is sent to all N agents simultaneously via AIP-001 (node protocol) or direct HTTP for serverless agents.

3. **Collection window**: Agents have a configurable deadline to respond (default 30 seconds). Late responses are accepted but marked as `late` and receive a 50% weight penalty.

4. **Minimum responses**: At least `ceil(N * 0.6)` responses (default 3 of 5) are required to attempt consensus. If fewer respond, the task is retried with a fresh agent pool.

```json
{
  "taskId": "consensus_task_001",
  "type": "price_witness",
  "payload": {
    "asset": "BTC",
    "currency": "USD"
  },
  "dispatchedTo": ["agent_f1", "agent_f2", "agent_c1", "agent_c2", "agent_c3"],
  "deadline": "2025-06-01T12:00:30.000Z",
  "minResponses": 3
}
```

### 4. Result Aggregation

Responses are aggregated differently depending on the data type of each result field.

#### 4.1 Numeric Fields — Weighted Median

For numeric values (prices, scores, counts), the consensus value is the **weighted median**:

1. Sort all agent responses by value.
2. Walk through sorted values, accumulating weights.
3. The consensus value is the value at which cumulative weight crosses 50% of total weight.

```
Agents:     [A: $67,400 w=1.0]  [B: $67,450 w=0.8]  [C: $67,430 w=0.6]  [D: $67,420 w=0.3]  [E: $68,000 w=0.1]
Sorted:     $67,400(1.0)  $67,420(0.3)  $67,430(0.6)  $67,450(0.8)  $68,000(0.1)
Cumulative: 1.0           1.3           1.9           2.7           2.8
50% of 2.8 = 1.4
Consensus:  $67,430 (cumulative weight crosses 1.4 at this value)
```

The weighted median is robust against outliers — agent E's anomalous $68,000 value is naturally excluded.

#### 4.2 Categorical Fields — Weighted Majority

For categorical values (labels, enum fields, boolean), the consensus value is the category with the highest cumulative weight:

```
Agents:     [A: "bullish" w=1.0]  [B: "bullish" w=0.8]  [C: "bearish" w=0.6]  [D: "bullish" w=0.3]  [E: "neutral" w=0.1]
Weighted:   bullish=2.1  bearish=0.6  neutral=0.1
Total=2.8   bullish share=2.1/2.8=75%
Consensus:  "bullish" (75% >= 66% threshold)
```

#### 4.3 Complex Objects

For nested objects, each field is aggregated independently using the appropriate method (numeric or categorical). The consensus result is a composite object with each field set to its individual consensus value.

### 5. Agreement Threshold

The agreement threshold is **66%** of total weighted vote mass (supermajority).

```
agreement = weight_of_consensus_answer / total_weight
```

| Agreement Level | Outcome |
|-----------------|---------|
| >= 66% | **Consensus reached** — result is accepted |
| 50% - 65% | **Weak consensus** — result accepted with low confidence flag |
| < 50% | **No consensus** — escalate to validators |

### 6. Confidence Score

Each consensus result includes a confidence score:

```
confidence = agreement_ratio * response_rate * median_agent_trust
```

Where:
- `agreement_ratio` = proportion of weight agreeing with consensus (0.66 - 1.00)
- `response_rate` = responses received / agents dispatched (0.60 - 1.00)
- `median_agent_trust` = median trust score of responding agents (0.00 - 1.00)

The confidence score ranges from 0.00 to 1.00. Results with confidence below 0.50 are flagged for optional validator review.

### 7. Disagreement Handling

When no consensus is reached (agreement < 50%):

1. **Retry once**: Re-dispatch the task to a new set of N agents. If consensus is reached on retry, that result is used.

2. **Escalate to validators**: If the retry also fails, the task is converted into a validation task per AIP-004:
   - The task description includes all agent responses and their weights.
   - Validators vote on the correct answer.
   - The validator consensus becomes the final result.

3. **Inconclusive**: If validators also fail to reach consensus (after two quorum expansions per AIP-004), the task is marked as **inconclusive**. No result is emitted and the requesting system is notified.

```
Task Dispatch (N=5)
      |
      v
  Collect Responses
      |
      v
  Calculate Agreement
      |
      +--- >= 66% ----> CONSENSUS (high confidence)
      |
      +--- 50-65% ----> WEAK CONSENSUS (low confidence flag)
      |
      +--- < 50% -----> Retry with new agents
                              |
                              +--- >= 50% ----> CONSENSUS
                              |
                              +--- < 50% -----> Escalate to Validators (AIP-004)
                                                      |
                                                      +--- Resolved ----> FINAL
                                                      |
                                                      +--- Failed ------> INCONCLUSIVE
```

### 8. Data Provider Aggregation

For tasks that involve external data (prices, events, metrics), the consensus engine incorporates data provider feeds (AIP-003) as additional signal.

#### Aggregation Formula

```
aggregate = sum(provider_value[i] * provider_weight[i]) / sum(provider_weight[i])
```

Where `provider_weight = aggregation_weight * trust_score` per AIP-003:

| Provider Status | Aggregation Weight |
|-----------------|--------------------|
| Sandbox | 0.0 |
| Active | 0.3 * trust_score |
| Trusted | 1.0 * trust_score |

The aggregated data provider value is treated as an additional "agent" response in the consensus calculation, with a weight equal to the average foundation agent weight. This ensures data providers contribute meaningful signal without dominating the consensus.

### 9. Cross-Verification

Agent results are cross-verified against data provider feeds when applicable:

1. For each result field that maps to a data provider category, compute the deviation between the agent's value and the data provider aggregate.
2. If deviation exceeds **10%**, flag the agent's response as a potential outlier.
3. Outlier responses receive a 50% weight reduction in the consensus calculation.
4. If more than 50% of agent responses are flagged as outliers relative to data providers, the data provider aggregate is used as the consensus value directly.

This mechanism prevents a coordinated group of agents from overriding well-established data provider feeds.

### 10. Finality

A consensus result achieves **finality** through one of the following paths:

| Path | Condition | Confidence Level |
|------|-----------|-----------------|
| **Immediate finality** | Agreement >= 80% AND all foundation agents agree | High |
| **Standard finality** | Agreement >= 66% | Normal |
| **Validator-confirmed finality** | Agent consensus + validator consensus agree | High |
| **Validator-only finality** | No agent consensus; validator consensus achieved | Normal |

Once final, a result is immutable and written to the network's result store with its consensus metadata (participating agents, weights, agreement ratio, confidence score, finality path).

### 11. Consensus Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `dispatchCount` | 5 | Number of agents per task |
| `minResponses` | 3 | Minimum responses to attempt consensus |
| `responseDeadlineMs` | 30000 | Agent response timeout |
| `agreementThreshold` | 0.66 | Supermajority threshold |
| `weakConsensusThreshold` | 0.50 | Minimum for weak consensus |
| `outlierDeviationThreshold` | 0.10 | Cross-verification deviation limit |
| `lateResponsePenalty` | 0.50 | Weight multiplier for late responses |
| `maxRetries` | 1 | Retry attempts before validator escalation |

Parameters are configurable at the network level and may be overridden per task type.

### 12. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v2/consensus/submit` | Submit a task to the consensus pipeline |
| `GET` | `/v2/consensus/tasks/:id` | Get task status and result |
| `GET` | `/v2/consensus/tasks/:id/votes` | Get individual agent responses (after finality) |
| `GET` | `/v2/consensus/tasks/:id/metadata` | Get consensus metadata (weights, agreement, confidence) |
| `GET` | `/v2/consensus/stats` | Network-wide consensus statistics |

All endpoints require authentication via `Authorization: Bearer <JWT>` header.

## Security Considerations

- **Foundation agent anchor**: At least one foundation agent participates in every consensus task, providing a reliable baseline that community agents alone cannot override.
- **Weight manipulation resistance**: Consensus weights are derived from trust scores (AIP-006), which use asymmetric penalties. An attacker would need to build genuine trust over time before gaining meaningful weight.
- **Cross-verification**: Data provider feeds provide an independent check on agent outputs, making it difficult to manipulate consensus without also controlling data providers.
- **Escalation path**: Disputed results escalate to human validators, adding a final layer of defense against automated manipulation.
- **Transparency**: All consensus results include full metadata (participating agents, weights, agreement ratios), enabling community auditing.

## Backwards Compatibility

AIP-007 replaces the simple majority-vote system used in the beta period. The new weighted supermajority mechanism is more robust but produces different results in edge cases. A 30-day transition period runs both systems in parallel, with the new system's results used for network output and the old system's results logged for comparison analysis.

## Reference Implementation

See `packages/consensus-engine/` for the consensus computation module and `apps/coordinator/src/consensus/` for the task dispatch and aggregation pipeline.
