# Security

Security is not a marketing bullet for us. This page documents the
**current state**, the **known gaps**, and the **plan** — updated as
things change, not once and forgotten.

---

## Reporting a vulnerability

**Do not open a public issue for a security bug.** Email
**`build@agtopen.com`** with:

- A short description of the issue.
- Steps to reproduce (proof-of-concept welcome).
- The impact you believe it has.
- Any contracts / addresses / endpoints affected.

We respond within **72 hours** with triage + an expected fix window.
Responsible disclosure is appreciated; we credit reporters (with
permission) in a public `SECURITY_THANKS.md` once fixes land.

A bug bounty program with payouts will launch once the mainnet audit
is complete — see roadmap below.

---

## Current state — Solidity contracts

### Test coverage

- **32 unit tests, 0 failing.** Foundry + fuzz (256 runs per test
  per the `[profile.default.fuzz]` block in `contracts/foundry.toml`).
- Coverage spans `AgentRegistry`, `StakingVault`, `BreedingVault`,
  including reverts for unauthorised callers, cooldown enforcement,
  and accuracy-bound checks.

### Static analysis — Slither

Latest Slither run (`0.11.4`, detectors `98`, excluding
`naming-convention` and `solc-version`) against `src/`:

| Severity | Count | Notes |
|---|---:|---|
| **High** | 0 | 1 originally found (`encode-packed-collision` in `ZKHub._verifyAndRecord`) — **fixed** by switching to `abi.encode`. |
| **Medium** | 7 | 3× `divide-before-multiply` + 4× `incorrect-equality` — accepted with rationale below. |
| **Low** | 17 | 13× `timestamp`, 2× `events-maths`, 1× `missing-zero-check`, 1× `calls-loop`. |
| **Informational** | 4 | Unindexed event-address parameters. |

**Raw reports** (JSON + human-readable) are committed in the main
Agentic Open repo under `contracts/audit/`. Re-running:

```bash
pip install slither-analyzer
cd contracts/
slither . --filter-paths "lib/|test/|script/" \
          --exclude naming-convention,solc-version
```

### Accepted findings — rationale

Not every Slither warning is worth "fixing." Here's why we are
leaving these in place and not inflating the severity:

- **`timestamp` (13 findings, all Low).** All uses are for staking /
  breeding / voting windows where a ±15 s miner clock skew is
  economically meaningless. Windows are days to months, not seconds.
- **`incorrect-equality` with enum / fixed-checkpoint comparisons
  (4 findings, Medium).** These compare `Enum == Value` or
  `daysStaked == 0`. Strict equality is correct here — no ordering
  semantics apply.
- **`divide-before-multiply` in `StakingVault._calculateReward`
  (3 findings, Medium).** Intentional loss of sub-day precision —
  rewards accrue per whole day by design (`daysStaked = Δt / DAY`).
  A full-precision calculation would pay rewards for partial days,
  which contradicts the "lockup" framing in the UX. Unit tests pin
  the expected integer behaviour.
- **`calls-loop` in `DAOGovernor.vote` (1 finding, Low).** The loop
  iterates over the caller's OWN staked agent IDs, capped by the
  caller's stake count. Gas per iteration is bounded; no external
  re-entry possible (the call reads `getStake`, a pure view).
- **`unindexed-event-address` (4 findings, Informational).** Most
  hit third-party OpenZeppelin events we can't modify. We'll index
  the 2 we own on the next non-breaking contract refactor.

### Design-level mitigations already in place

- **ReentrancyGuard** from OpenZeppelin on every external call that
  moves tokens.
- **Role-gated admin** (`onlyOwner`, `onlyRelayer`, `onlyVault`) on
  every state-mutating privileged function.
- **Pausable** emergency brake on `BreedingVault`, `StakingVault`,
  `ArenaMatch`.
- **Solidity 0.8.24** — built-in checked arithmetic; no SafeMath
  needed, no unchecked blocks on user input paths.
- **`via_ir = true`, `optimizer_runs = 200`** — via-IR path closes a
  class of stack-too-deep bugs; conservative optimizer runs keeps
  semantics predictable.
- **Proof anti-replay in `ZKHub`** — every accepted proof's hash is
  stored; duplicates are rejected before the verifier is even called.

### Known gaps (tracked, not fixed yet)

- **ZK verifiers are `MockZKVerifier` on both testnets.**
  Real Noir → Solidity verifiers are generated via `bb` (Barretenberg)
  and must replace the mocks before mainnet. See
  [`CONTRACTS.md`](./CONTRACTS.md) for the verifier slots that will
  change. Until then, ZK branches on testnet have **no security
  guarantee** — proofs are accepted by construction.
- **Professional audit not yet engaged.** See next section.
- **Mainnet deployer key.** Testnets use a dev EOA. Mainnet deployment
  blocks on a 3-of-5 Gnosis Safe; the multi-sig address will be
  published in `CONTRACTS.md` before any mainnet tx.

---

## Professional audit — plan

**Status:** not yet engaged. We are a pre-seed team and have
deliberately sequenced the audit *after* two things:

1. Replacing `MockZKVerifier` with the real Noir-generated verifiers —
   auditing mocks wastes budget.
2. Freezing the economic parameters (AGT allocation, APY curves,
   breeding fee) documented in
   `contracts/MAINNET_DEPLOYMENT.md` — an audit against parameters
   that shift a week later is wasted budget #2.

**Target audit firms** (short list we are evaluating, in no
particular order):

- Trail of Bits
- OpenZeppelin
- ConsenSys Diligence
- Zellic
- Cyfrin
- Spearbit

Selection criteria: prior ZK / Noir experience, availability inside a
**Q3 2026** window, reasonable scope-to-quote ratio, willingness to
re-review after fixes. Expected scope: the 6 non-mock production
contracts + the 5 ZK verifiers once real, ~3–4 weeks.

**Budget:** funded from the treasury set aside in the pre-seed round;
exact number published once the engagement letter is signed.

**Deliverables we will publish on completion:**

- Full audit report (PDF), linked here.
- All findings triaged with resolution status.
- Commit references for every fix.
- Re-audit attestation that all critical/high are closed.

Mainnet deployment happens **after** all critical + high findings
are closed and re-reviewed.

---

## Operational security

The off-chain surface is also in scope:

- **JWT auth** on API endpoints that mutate state; rate-limited per
  user id (not IP) so rotating IPs don't dodge caps.
- **HMAC-signed outbound webhooks** — the agent-engine's
  `call-webhook` action emits `X-Agtopen-Signature: sha256=<hex>`
  over the raw body. The receiver verifies with
  `AgtOpenForge.verifyWebhook` (Web-Crypto, Node 20+ / Bun / Deno /
  Cloudflare Workers — no Node-specific dependency).
- **Per-agent webhook secret** — 256-bit, rotatable via
  `/forge/:id/webhook-secret/rotate`. Never returned by the general
  `GET /forge/:id` endpoint; only by the dedicated secret endpoint,
  auth-gated to the agent owner.
- **Prime-directive sanitisation** — user-supplied agent prompts are
  scanned for jailbreak tokens / HTML injection before being stored;
  rejected input never reaches the LLM.
- **Live-execution disclaimer gate** — every forge agent defaults to
  `executionMode = 'paper'`. Flipping to `live` (real-money) requires
  three distinct boolean acks + a typed confirmation string + the
  disclaimer version, all audit-trailed (IP + timestamp + version).

---

## Timeline

| When | What |
|---|---|
| Ongoing | Slither + `forge test` run on every contract change. |
| Q2 2026 | GitHub Actions CI badge on every repo; blocks merge on test/typecheck failure. |
| Q2 2026 | Real Noir verifiers generated, replacing mocks on testnets. |
| Q3 2026 | Engage professional audit firm (selection in progress). |
| Q3 2026 | Audit in flight; public findings + resolutions tracked here. |
| Q3/Q4 2026 | Bug bounty program launches (Immunefi or equivalent). |
| Post-audit | Mainnet deployment (behind 3-of-5 multi-sig). |

---

## Changelog

- **2026-04-24** — SECURITY.md v1. Slither baseline: 0 High, 7 Medium,
  17 Low, 4 Informational. Fixed `encode-packed-collision` in
  `ZKHub._verifyAndRecord` (switched to `abi.encode`) and initialised
  `valid` in the same function. 32 foundry tests passing.
