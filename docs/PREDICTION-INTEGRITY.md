# Prediction Integrity — How AgtOpen Proves Its Track Record

> Every AI prediction on agtopen.com is committed at creation,
> anchored on-chain, and verifiable by anyone with three lines of
> TypeScript. This document explains what that actually means and
> how to verify a claim yourself.

---

## The problem

Every AI prediction platform shows accuracy numbers. None of them
let you check.

When a platform claims "our model is 91% accurate," you have three
options:

1. Believe it.
2. Run your own backtests against logs the platform controls.
3. Walk away.

The platform can backfill. The platform can cherry-pick. The
platform can quietly delete losing predictions and only surface
wins. There is no way for an outsider to tell a real 91% from a
fabricated 91%, because every artifact lives behind the platform's
own database and the platform owns the timestamps.

We hit exactly this credibility wall in April 2026. AgtOpen's 18
Genesis Agents had hand-authored "92% historical accuracy" strings
in their system prompts that no resolution pipeline ever updated.
Real DB numbers showed Oracle at **33% (161/487)**, not 91%. Anyone
willing to run one SQL query could see the lie.

This page documents what we did about it.

---

## The fix in one paragraph

When an agent generates a prediction, we hash a canonical
serialization of its contents (market, direction, confidence,
target price, current price, reasoning, timestamp) together with a
private 32-byte nonce. The hash goes into the database publicly;
the nonce stays secret until the prediction resolves. We then
submit the hash to a smart contract on **two independent
blockchains** (Base Sepolia + Arc Testnet) — the block timestamps
on those transactions are the witness that the prediction existed
*before* its outcome was known. After resolution we publish the
nonce, and any third party can recompute the hash in a browser and
confirm it matches.

There is no backfill possible without rewriting two public
blockchains. There is no cherry-picking possible because every
prediction the agent ever made is on-chain, including the wrong
ones. The accuracy you see is the accuracy you can compute, and
the compute runs on your hardware, not ours.

---

## Step-by-step: a single prediction, end to end

### 1. The agent makes a prediction

Oracle, our prediction agent, runs every 60 seconds on a server we
control. On 2026-04-25 02:21 UTC it generated:

| Field | Value |
|---|---|
| Market | BNB/USD |
| Direction | LONG |
| Confidence | 0.72 |
| Target price | $665 |
| Current price | $637.30 |
| Reasoning | (full text in `reasoning` field) |

A normal AI platform would just write this row. We do one extra step:

```ts
const nonce = generateRandom32Bytes();          // private
const preimage = canonicalize(prediction, nonce);
const commitmentHash = sha256(preimage);        // public
```

The exact canonicalization is documented in
[`apps/agent-engine/src/services/prediction-commitment.ts`](https://github.com/agtopen/agtopen/blob/main/packages/sdk/src/predictions.ts).
Both the agent-engine and the public SDK implement it identically;
any drift between the two is caught by a known-answer test in CI.

The prediction row gets written with `commitmentHash` exposed and
`commitmentNonce` kept private until resolution.

### 2. The hash is anchored on-chain

A scheduler cron picks up the new commitment within one minute and
submits it to the **ZKHub** contract on:

- **Base Sepolia** (chainId 84532) — the trust floor. Public chain,
  not operated by AgtOpen.
- **Arc Testnet** (chainId 5042002) — agtopen's native chain.
  Redundancy + native-chain visibility.

Both anchors call the same function shape:

```solidity
function verifyPrediction(
  bytes calldata _proof,
  bytes32[5] calldata _publicInputs
) external returns (bool);

// _publicInputs = [
//   commitmentHash,                     // bytes32
//   keccak256(agentId),                 // bytes32
//   keccak256(market),                  // bytes32
//   uint256(direction),                 // 0=LONG, 1=SHORT, 2=NEUTRAL
//   uint256(confidence * 10_000)        // bps
// ]
```

For the BNB/USD prediction above:

- Base Sepolia tx: [`0x8721e2c6…2689`](https://sepolia.basescan.org/tx/0x8721e2c650bde53ce647a5ec31d45fe8dc428009c682885db5a0cedaf16d2689)
  block 40,658,823.
- Arc Testnet tx: [`0x3c2bef09…f452`](https://explorer.arc.network/tx/0x3c2bef0925f452)
  block 38,916,927.

The block timestamps are independent of agtopen's database. We do
not run Base Sepolia. Even on Arc Testnet, we don't control
consensus enough to rewrite block headers without burning the chain
publicly. Either witness alone is sufficient; together, they're
overdetermined.

### 3. The prediction resolves

At 02:21 UTC the next day, BNB/USD is at some price. Three outcomes:

- BNB ≥ $665 → status `correct`.
- BNB price stayed flat or moved against the call → status `wrong`.
- Edge case (data feed gap) → status `expired`.

The resolution pipeline fires once per minute and atomically updates
the prediction row's `status` + `outcomePrice`. **At this point
the nonce becomes available** via:

```bash
GET https://api.agtopen.com/predictions/<id>/reveal
```

(While the prediction is still pending, the same endpoint returns
HTTP 423 Locked — releasing the nonce early would break the
binding property.)

### 4. Anyone verifies, anywhere

```ts
import { AgtOpenPredictions } from '@agtopen/sdk';

const signals = new AgtOpenPredictions({});
const reveal = await signals.getReveal('e08a4a881999cf0f66f4a51c');
const ok = await AgtOpenPredictions.verifyCommitment(reveal);
//      ^── true means: agtopen did not backfill this prediction.
```

That's it. The verifier:

1. Re-derives the canonical preimage from the reveal payload.
2. Runs SHA-256 on it locally.
3. Compares the result to `commitmentHash` byte-for-byte.

If the hashes match, the contents have not been altered since
creation. The chain timestamp confirms the commitment was
published before the outcome was known. The two together are
sufficient to verify a claim end-to-end without trusting agtopen.

The SDK runs on Node 20+, Bun, Deno, browsers, and Cloudflare
Workers. It uses Web Crypto only — no Node-specific APIs.

---

## What this scheme does NOT do

Honest disclosure is part of the moat:

- **It does not hide the prediction from the agent at creation
  time.** The agent knows what it predicted; we just lock that
  knowledge against later rewriting.
- **It does not prove the agent is right.** It proves the agent
  *committed* before the outcome. The outcome itself is determined
  by the market data feed, which we do trust (Coingecko, Yahoo
  Finance) — though that trust is itself auditable since we record
  the price feeds we used per resolution.
- **It does not yet prove confidence with zero knowledge.** To
  prove "I had >70% confidence" without revealing the exact value,
  we'd need the Noir `prediction_integrity` zk-SNARK circuit,
  which is in our roadmap but currently blocked on toolchain
  alignment. The current `circuitId: 'sha256_v1'` is a strict
  subset of what the SNARK will eventually do; no migration needed
  when we add the SNARK layer on top.
- **It does not retroactively cover predictions made before
  2026-04-25.** Older Oracle predictions don't carry commitments;
  the verifier returns HTTP 410 Gone for those, and no, we don't
  claim accuracy on them.

---

## Why two chains

We could have shipped with just Base Sepolia and called it done.
Instead we anchor on two chains. Reasons:

| Concern | Single-chain answer | Dual-chain answer |
|---|---|---|
| Public, neutral witness | Base Sepolia is fine. | Same — Base Sepolia stays the trust floor. |
| RPC outage during a tick | Tick fails silently; prediction sits unanchored until next tick. | Arc still witnesses; backlog catches up on Base later. |
| Operator self-DOS attack | One chain can be starved of gas to suppress anchors. | Need to starve both chains simultaneously. |
| Native-chain visibility | None — Arc users don't see our anchors. | Arc explorers show every prediction landing. |

Adding Arc never weakens the moat; it strictly hardens it. A
verifier that only trusts Base Sepolia gets the same guarantee
they always had. A verifier curious about Arc gets a second
independent witness for free.

---

## Live counters

The page at [agtopen.com/proof](https://agtopen.com/proof) shows
the live state of all of this — committed, anchored on each chain,
resolved, fully verified. Same data is available raw via:

```bash
curl https://api.agtopen.com/predictions/integrity
```

For developers building on top, the SDK exposes everything:

```bash
npm i @agtopen/sdk
```

```ts
import { AgtOpenPredictions } from '@agtopen/sdk';
const signals = new AgtOpenPredictions({});

// list latest predictions with their commitment hashes + chain anchors
const { predictions } = await signals.list({ limit: 20 });

// verify any one of them
const reveal = await signals.getReveal(predictions[0].id);
const ok = await AgtOpenPredictions.verifyCommitment(reveal);
```

---

## Source code

Everything documented here is open source under MIT:

- [Anchor service (agent-engine)](https://github.com/agtopen/agtopen-core/blob/main/apps/agent-engine/src/services/prediction-anchor.ts)
- [Commitment service](https://github.com/agtopen/agtopen-core/blob/main/apps/agent-engine/src/services/prediction-commitment.ts)
- [API endpoints (`/reveal`, `/integrity`)](https://github.com/agtopen/agtopen-core/blob/main/apps/api-core/src/routes/predictions.ts)
- [Verifier page](https://github.com/agtopen/agtopen-core/blob/main/apps/web/app/verify/verify-client.tsx)
- [Proof dashboard](https://github.com/agtopen/agtopen-core/blob/main/apps/web/app/proof/proof-client.tsx)
- [SDK](https://github.com/agtopen/agtopen/tree/main/packages/sdk)
- [ZKHub contract](https://github.com/agtopen/agtopen-core/blob/main/contracts/src/ZKHub.sol)

The agent-engine and api-core repos are private (they hold
Coolify-deployed services with non-public env), but every public
artifact — SDK, contracts, docs, AIPs — lives at
[github.com/agtopen/agtopen](https://github.com/agtopen/agtopen).
