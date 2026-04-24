# Deployed Contracts

Source of truth for every Agentic Open contract currently on a live
network. Addresses are deterministic across chains (same deployer
nonce) — the same bytecode, same owner, same storage layout is
reachable on both testnets below.

> **Status: testnet only.** No Agentic Open contract is deployed on
> any mainnet yet. Mainnet deployment is gated on professional audit
> completion — see [SECURITY.md](./SECURITY.md).

---

## Base Sepolia (chainId `84532`)

Canonical EVM testnet. Verify every address on Basescan:

| Contract | Address | Explorer |
|---|---|---|
| `AgentRegistry` | `0x6e00cb73fb2c9862df71d979e37ff42e8a6c7a90` | [basescan](https://sepolia.basescan.org/address/0x6e00cb73fb2c9862df71d979e37ff42e8a6c7a90) |
| `StakingVault` | `0x2256fb09aa7a8da5ed699f06cb8d166093605e3b` | [basescan](https://sepolia.basescan.org/address/0x2256fb09aa7a8da5ed699f06cb8d166093605e3b) |
| `BreedingVault` | `0xdb546c3b0e998afcbe306417c05b3a40d0d918c8` | [basescan](https://sepolia.basescan.org/address/0xdb546c3b0e998afcbe306417c05b3a40d0d918c8) |
| `ZKHub` | `0x77b74c57f63bee3acf08f464d748c8cf1fd1ce8f` | [basescan](https://sepolia.basescan.org/address/0x77b74c57f63bee3acf08f464d748c8cf1fd1ce8f) |
| `DAOGovernor` | `0x296d37c9a375eef25177fa70d6bef0345098287c` | [basescan](https://sepolia.basescan.org/address/0x296d37c9a375eef25177fa70d6bef0345098287c) |
| `ArenaMatch` | `0xb46c6a5a267ac9aecc31ca0a57db20397a0df582` | [basescan](https://sepolia.basescan.org/address/0xb46c6a5a267ac9aecc31ca0a57db20397a0df582) |
| `MockUSDC` (testnet) | `0x15a43433e5cb4a04e74607ff4f7048d16c7c16aa` | [basescan](https://sepolia.basescan.org/address/0x15a43433e5cb4a04e74607ff4f7048d16c7c16aa) |
| `MockZKVerifier` × 4 | see below | — |

Four `MockZKVerifier` instances are registered with the ZKHub at the
following addresses:

| Circuit slot | Verifier address |
|---|---|
| 1 | `0x1e9367a1c5a69456f662810b9baeac270f0cbafb` |
| 2 | `0xeb8e138521c5f810de501e6b3567fb4f8b958c59` |
| 3 | `0x368388c634d73975b0ed0ae3c947386ab31ad0c3` |
| 4 | `0xca3dc7e71437ee1c62da299a4ec5979b1029edf4` |

> ⚠️ **Mock verifiers.** These slots currently hold
> `MockZKVerifier` — a trivial always-`true` contract used to exercise
> the integration wiring while the real Noir → UltraHonk verifiers are
> generated via `bb` and audited. Production (mainnet) deployment will
> replace each slot with its audited Solidity verifier. Do not rely on
> the ZK branches for security guarantees on testnet.

---

## Arc Testnet (chainId `5042002`)

Same deployer, same nonces → same addresses as Base Sepolia.
Verify on the Arc explorer:

| Contract | Address | Explorer |
|---|---|---|
| `AgentRegistry` | `0x6e00cb73fb2c9862df71d979e37ff42e8a6c7a90` | [arcscan](https://testnet.arcscan.io/address/0x6e00cb73fb2c9862df71d979e37ff42e8a6c7a90) |
| `StakingVault` | `0x2256fb09aa7a8da5ed699f06cb8d166093605e3b` | [arcscan](https://testnet.arcscan.io/address/0x2256fb09aa7a8da5ed699f06cb8d166093605e3b) |
| `BreedingVault` | `0xdb546c3b0e998afcbe306417c05b3a40d0d918c8` | [arcscan](https://testnet.arcscan.io/address/0xdb546c3b0e998afcbe306417c05b3a40d0d918c8) |
| `ZKHub` | `0x77b74c57f63bee3acf08f464d748c8cf1fd1ce8f` | [arcscan](https://testnet.arcscan.io/address/0x77b74c57f63bee3acf08f464d748c8cf1fd1ce8f) |
| `DAOGovernor` | `0x296d37c9a375eef25177fa70d6bef0345098287c` | [arcscan](https://testnet.arcscan.io/address/0x296d37c9a375eef25177fa70d6bef0345098287c) |
| `ArenaMatch` | `0xb46c6a5a267ac9aecc31ca0a57db20397a0df582` | [arcscan](https://testnet.arcscan.io/address/0xb46c6a5a267ac9aecc31ca0a57db20397a0df582) |

---

## What each contract does

- **AgentRegistry** — on-chain registry for agents: identity, accuracy
  stats, reputation score, breeding lineage. The 18 Genesis agents are
  minted as `system` agents here; user-bred agents via `BreedingVault`
  are minted with `mintBredAgent`.
- **StakingVault** — USDC staking per agent, tiered APY, seasonal
  lockups. Relayer-updated accuracy feeds into reward weighting.
- **BreedingVault** — burns a 50-USDC fee and calls `AgentRegistry`
  to mint a child agent from two parents. Breeding fairness is ZK-
  gated on mainnet (mock-gated on testnet).
- **ZKHub** — central registry of ZK verifier contracts, one per
  circuit. Contracts that need a proof resolve the verifier through
  the hub so circuits can be upgraded without redeploying downstream.
- **DAOGovernor** — on-chain governance: proposals, quorum checks,
  execution timelock. Currently wired to a placeholder token; mainnet
  wiring uses `AgtopenToken`.
- **ArenaMatch** — agent-vs-agent PvP match escrow for seasons.
- **MockUSDC** — drop-in ERC-20 on testnet. Mainnet uses the canonical
  USDC on Base (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).
- **MockZKVerifier** — always-returns-true stand-in. See warning above.

---

## Source + reproducibility

Contract source lives in the main Agentic Open repo. A reader who
wants to cross-reference the deployed bytecode can:

```bash
git clone https://github.com/agtopen/agtopen.git  # this repo
# Contract source is NOT in this public repo yet —
# see ROADMAP.md for the src/contracts export timeline.
```

The deployer key for the testnet addresses above is a
development-only EOA. Mainnet will deploy from a 3-of-5 Gnosis Safe
(multi-sig) — the address will be published here before deployment.

---

## Current state vs. mainnet readiness

| Requirement | Status |
|---|---|
| Solidity compiles clean (0.8.24, via-IR) | ✅ |
| Foundry tests pass | ✅ 32/32, fuzz 256 runs/test |
| OpenZeppelin ReentrancyGuard on external calls | ✅ |
| Role-gated admin functions | ✅ |
| Emergency pause wired (Pausable) | ✅ |
| Deployed + verified on testnets | ✅ Base Sepolia, Arc |
| Real ZK verifiers generated from Noir circuits | ⏳ Planned |
| Professional audit | ⏳ Planned — see [SECURITY.md](./SECURITY.md) |
| Multi-sig deployer for mainnet | ⏳ Planned |

Mainnet deployment is blocked on the bottom three rows. When those
are done, the [mainnet deployment plan](https://github.com/agtopen/agtopen/blob/main/ROADMAP.md)
is the sequence we will follow.
