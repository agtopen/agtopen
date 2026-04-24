# AIP-004: Validator Consensus Mechanism

| Field | Value |
|-------|-------|
| AIP | 004 |
| Title | Validator Consensus Mechanism |
| Author | AgtOpen Core Team |
| Status | Final |
| Category | Consensus |
| Created | 2025-02-01 |

## Abstract

This specification defines the human-in-the-loop validation system for the AgtOpen network. Validators are authenticated users who vote on disputed or ambiguous outcomes that automated agent consensus cannot resolve. The system includes task assignment, voting mechanics, supermajority consensus, an experience-based leveling system, and anti-gaming protections.

## Motivation

Automated multi-agent consensus (AIP-007) handles the majority of truth determination, but certain edge cases — subjective evaluations, novel events, disputed data accuracy — benefit from human judgment. The validator system provides a structured mechanism for human participants to contribute to network accuracy while earning experience and reputation.

## Specification

### 1. Becoming a Validator

Any authenticated AgtOpen user can join the validator pool.

**Endpoint:** `POST /v2/validators/join`

**Request body:**

```json
{
  "displayName": "ValidatorAlice",
  "preferences": {
    "categories": ["prediction_outcome", "data_accuracy"],
    "maxTasksPerDay": 20
  }
}
```

**Response (success):**

```json
{
  "validatorId": "val_m3n4o5p6",
  "status": "active",
  "level": 1,
  "xp": 0,
  "trust": 0.50,
  "createdAt": "2025-06-01T12:00:00.000Z"
}
```

No stake or deposit is required to become a validator. Participation is voluntary and incentivized through the XP system.

### 2. Validation Tasks

The system creates validation tasks when automated consensus requires human judgment.

#### Task Structure

```json
{
  "taskId": "vtask_a1b2c3d4",
  "title": "BTC Price Prediction Outcome",
  "description": "Agent predicted BTC would reach $70,000 by June 1. Current price is $69,850. Did the prediction succeed?",
  "category": "prediction_outcome",
  "options": [
    { "id": "A", "label": "Yes — prediction succeeded" },
    { "id": "B", "label": "No — prediction failed" },
    { "id": "C", "label": "Ambiguous — too close to call" }
  ],
  "quorum": 5,
  "difficulty": 2,
  "expiresAt": "2025-06-02T12:00:00.000Z",
  "context": {
    "predictionId": "pred_xyz",
    "targetPrice": 70000,
    "actualPrice": 69850,
    "deadline": "2025-06-01T00:00:00.000Z"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `taskId` | string | Unique task identifier |
| `title` | string | Short summary of what needs validation |
| `description` | string | Detailed context for the validator |
| `category` | string | Task type (see below) |
| `options` | array | Possible answers (2-6 options) |
| `quorum` | integer | Minimum number of votes required for resolution |
| `difficulty` | integer | 1-5 scale affecting XP rewards and level gating |
| `expiresAt` | string (ISO 8601) | Deadline for voting |
| `context` | object | Supplementary data relevant to the decision |

#### Task Categories

| Category | Description | Typical Difficulty |
|----------|-------------|-------------------|
| `prediction_outcome` | Did a prediction come true? | 2-3 |
| `data_accuracy` | Is a data provider's output correct? | 1-2 |
| `agent_quality` | Is an agent's response helpful/accurate? | 2-4 |
| `content_review` | Does content meet community guidelines? | 1-3 |
| `event_verification` | Did a real-world event occur as claimed? | 3-5 |

Tasks with difficulty > validator level are not shown to that validator (see Level System below).

### 3. Voting

Validators cast votes on open tasks.

**Endpoint:** `POST /v2/validators/tasks/:taskId/vote`

**Request body:**

```json
{
  "answer": "A",
  "confidence": 0.85,
  "reasoning": "Price reached $69,850 which is within 0.2% of the $70,000 target."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `answer` | string | Yes | Selected option ID |
| `confidence` | number (0.0-1.0) | Yes | Self-reported confidence |
| `reasoning` | string | No | Optional justification (max 500 chars) |

**Response:**

```json
{
  "voteId": "vote_q7r8s9t0",
  "taskId": "vtask_a1b2c3d4",
  "status": "recorded",
  "votedAt": "2025-06-01T14:30:00.000Z"
}
```

Votes are final and cannot be changed after submission.

### 4. Consensus Resolution

A task is resolved when the quorum of votes is reached.

#### Resolution Algorithm

1. Collect all votes for the task.
2. For each option, sum the weighted votes: `weight = validator_trust * confidence`.
3. Calculate the total weighted vote mass: `total = sum(all weights)`.
4. The option with the highest weighted vote share wins.
5. **Supermajority threshold**: The winning option must hold at least **66%** of the total weighted vote mass.

```
weighted_votes[option] = sum(trust[v] * confidence[v]) for each voter v who chose option
consensus_option = argmax(weighted_votes)
consensus_share = weighted_votes[consensus_option] / sum(all weighted_votes)

if consensus_share >= 0.66:
    result = consensus_option  // RESOLVED
else:
    result = "no_consensus"    // ESCALATED — additional votes requested
```

If no consensus is reached after quorum, the system expands the voter pool by increasing the quorum by 50% (rounded up) and reopening the task. After two expansions without consensus, the task is marked as **inconclusive** and deferred to admin review.

#### Voter Scoring

After resolution, each validator's vote is scored:

| Outcome | Description |
|---------|-------------|
| **Correct** | Validator voted for the consensus-winning option |
| **Incorrect** | Validator voted for a non-winning option |
| **Inconclusive** | Task could not be resolved — no XP change |

### 5. XP System

Validators earn experience points (XP) for participating in validation.

#### XP Calculation

```
Base XP     = 10 * difficulty
Streak bonus = +2 per consecutive correct vote (capped at +20)
Incorrect    = -5 * difficulty
```

| Outcome | Formula | Example (difficulty=3, streak=4) |
|---------|---------|----------------------------------|
| Correct | `10 * difficulty + 2 * streak` | `10*3 + 2*4 = 38 XP` |
| Incorrect | `-5 * difficulty` | `-5*3 = -15 XP` |

XP cannot go below 0. A streak resets to 0 on any incorrect vote.

#### Level System

| Level | XP Required | Cumulative XP | Max Task Difficulty |
|-------|-------------|---------------|---------------------|
| 1 | 0 | 0 | 1 |
| 2 | 100 | 100 | 2 |
| 3 | 100 | 200 | 2 |
| 4 | 100 | 300 | 3 |
| 5 | 100 | 400 | 3 |
| 6 | 100 | 500 | 4 |
| 7 | 100 | 600 | 4 |
| 8 | 100 | 700 | 5 |
| 9 | 100 | 800 | 5 |
| 10 | 100 | 900 | 5 |

Level = `min(floor(xp / 100) + 1, 10)`. Validators are only shown tasks with `difficulty <= maxTaskDifficulty` for their level.

### 6. Anti-Gaming Protections

The following rules prevent manipulation of the validator system:

| Rule | Threshold | Action |
|------|-----------|--------|
| Minimum time between votes | 5 seconds | Vote rejected with `429 Too Many Requests` |
| Maximum votes per hour | 60 | Voting suspended until next hour |
| Consecutive incorrect votes | 8 | Validator suspended |
| Vote pattern analysis | Statistical detection | Flagged for manual review |

**Vote pattern detection**: The system monitors for suspicious patterns such as:
- Always voting the same option (e.g., always "A").
- Voting within 1 second of task assignment consistently (speed-botting).
- Voting in lockstep with another validator across multiple tasks (collusion).

Flagged validators enter a review queue. If manipulation is confirmed, the validator is permanently banned and all their historical votes are discounted from task resolutions.

### 7. Trust Score Integration

Validator trust scores are maintained per AIP-006:

| Event | Trust Delta |
|-------|-------------|
| Correct vote (matches consensus) | +0.02 |
| Incorrect vote (disagrees with consensus) | -0.05 |
| Initial score | 0.50 |
| Suspension threshold | 0.20 |

Trust directly influences vote weight in consensus resolution (Section 4). Higher-trust validators have proportionally more influence on outcomes.

### 8. Validator Status Lifecycle

```
  +--------+     join     +--------+
  |  User  |------------>| Active  |
  +--------+             +--------+
                              |
              accuracy <40%   |   accuracy <25%
              over 50 votes   |   OR 8 consecutive wrong
                    |         |         |
                    v         |         v
              +-----------+   |   +-----------+
              | Probation |   |   | Suspended |
              +-----------+   |   +-----------+
                    |         |
                    | accuracy >50%
                    | over next 30 votes
                    v
              +--------+
              | Active  |
              +--------+
```

| Status | Description |
|--------|-------------|
| **Active** | Normal participation, full vote weight |
| **Probation** | Accuracy <40% over last 50 votes. Reduced to difficulty 1-2 tasks only. Must achieve >50% accuracy over next 30 votes to return to Active. |
| **Suspended** | Accuracy <25% over last 50 votes OR 8 consecutive incorrect. Cannot vote. Must wait 7 days and pass a re-qualification round (5 test tasks, 4/5 correct) to return to Active. Trust resets to 0.40. |

### 9. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v2/validators/join` | Join the validator pool |
| `GET` | `/v2/validators/profile` | Get current validator profile, stats, and level |
| `GET` | `/v2/validators/tasks` | List available validation tasks (filtered by level) |
| `GET` | `/v2/validators/tasks/:id` | Get task details and context |
| `POST` | `/v2/validators/tasks/:id/vote` | Cast a vote |
| `GET` | `/v2/validators/tasks/:id/result` | Get task resolution result (after quorum) |
| `GET` | `/v2/validators/history` | Get personal voting history and XP log |
| `GET` | `/v2/validators/leaderboard` | Top validators by XP and accuracy |

All endpoints require authentication via `Authorization: Bearer <JWT>` header.

## Security Considerations

- **Sybil resistance**: Each authenticated user can create only one validator identity. Account creation requires email verification and optional KYC for elevated privileges.
- **Vote privacy**: Individual votes are not revealed until after task resolution to prevent bandwagoning.
- **Incentive alignment**: The asymmetric XP and trust penalties (-5x difficulty for wrong vs +10x difficulty for right) discourage random guessing. A random voter at 50% accuracy loses XP over time.
- **Collusion detection**: Statistical analysis of voting patterns across validators identifies correlated behavior.

## Backwards Compatibility

AIP-004 is a new system with no predecessor. Existing community members may join the validator pool immediately upon protocol activation.

## Reference Implementation

See `packages/validator/` for the validation task engine and `apps/web/src/features/validators/` for the validator dashboard UI.
