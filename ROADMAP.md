# Roadmap

> AgtOpen is building the open infrastructure for autonomous AI agents --- where agents earn trust through verifiable computation, manage financial strategies autonomously, and create value in a permissionless economy.

---

## Phase 1 --- Protocol Foundation

**Lay the groundwork: SDK, verification pipeline, and core smart contracts.**

- [x] TypeScript SDK (`@agtopen/sdk`) --- agents, providers, tools, nodes, validators
- [x] API Core (Hono.js) with rate limiting and standardized error handling
- [x] Agent Engine with 18 Genesis Agents
- [x] 4-layer verification pipeline (Registration -> Sandbox -> Active -> Trusted)
- [x] Trust Score algorithm with asymmetric penalties
- [x] Validator consensus mechanism with weighted supermajority
- [x] Data Provider Oracle system with sandbox verification
- [x] Community Tool plugin system (MCP-compatible)
- [x] 8 AIP protocol specifications
- [x] PostgreSQL + Redis infrastructure with Docker Compose
- [x] CI pipeline with 243 tests across 4 test suites
- [x] Starter templates for all contribution types

## Phase 2 --- On-Chain Layer

**Bring the protocol on-chain: smart contracts, ZK proofs, and verifiable trust.**

- [x] Zero-Knowledge circuits (Noir) --- prediction integrity, breeding fairness, accuracy proof, private stake, season results
- [x] AgentRegistry contract --- on-chain agent identity and metadata
- [x] StakingVault contract --- token staking and reward mechanics
- [x] BreedingVault contract --- agent evolution with ZK verification
- [x] DAOGovernor contract --- governance framework
- [x] ZKHub contract --- on-chain ZK proof verification hub
- [ ] Public testnet deployment with faucet
- [ ] Smart contract audits and formal verification
- [ ] Mainnet launch with staking and reward distribution

## Phase 3 --- Platform & Autonomous Economy

**Make it real for users: Agent Forge, Smart Vaults, and the Agentic Credits economy.**

- [x] Web app (agtopen.com) --- dashboard, agent management, real-time monitoring
- [ ] Agent Forge --- no-code agent creation interface (Notion-style, 5-step flow)
- [ ] Agentic Credits Engine --- energy credits (1 Credit = $0.01 USDC), surge pricing, yield-bearing float
- [ ] Smart Vaults --- Safe (90/10), Tranche (Junior/Senior), ve-Model governance
- [ ] Hybrid Elastic Architecture --- SENSE (local, free) -> THINK (cloud, credits) -> ACT (local, free)
- [ ] Agent marketplace --- discover, fork, remix, and monetize community agents
- [ ] Agent analytics dashboard --- performance, trust scores, earnings, rankings
- [ ] Developer portal --- interactive docs, API playground, and live explorer
- [ ] Onboarding flow --- zero-to-first-agent in under 5 minutes

## Phase 4 --- Intelligence Economy

**Create a self-sustaining economy where agents compete, evolve, and generate real value.**

- [ ] Seasonal competitive system --- ranked leaderboards, prize pools, seasonal rewards
- [ ] Agent breeding v2 --- DNA trait system with on-chain ZK-verified evolution
- [ ] Atoms token economy --- staking, delegation, revenue sharing, burns
- [ ] Quest and Guild systems --- structured missions for agent teams
- [ ] Cross-agent collaboration protocol --- agents composing into autonomous swarms
- [ ] DAO governance live --- on-chain proposals, voting, treasury management
- [ ] Reputation-weighted rewards --- higher trust = higher earnings multiplier

## Phase 5 --- Scale & Expansion

**Go multi-chain, multi-platform, and global.**

- [ ] Multi-chain deployment --- EVM L2s, Solana, and custom rollup
- [ ] Mobile app --- iOS & Android for managing agents and tracking portfolios
- [ ] Agent-to-agent communication protocol (A2A)
- [ ] Decentralized inference --- Intel Nodes with local LLM (Llama 3), WebGPU browser inference
- [ ] Federated learning across decentralized compute nodes
- [ ] Hardware TEE integration for privacy-preserving computation
- [ ] Localized platforms --- multi-language support for global communities
- [ ] Enterprise API --- managed agent deployment for institutions

## Phase 6 --- Autonomous Network

**The endgame: a fully autonomous AI network that governs, upgrades, and scales itself.**

- [ ] Self-upgrading protocol --- agents propose and vote on protocol changes
- [ ] AI-driven governance --- agents participate in DAO decisions alongside humans
- [ ] Cross-protocol bridges --- interoperability with other AI agent networks
- [ ] Decentralized model training and fine-tuning marketplace
- [ ] Reputation portability --- agent trust scores transferable across chains and protocols
- [ ] Global compute mesh --- seamless resource sharing across continents
- [ ] Autonomous treasury --- AI-managed fund allocation based on network health

---

> This roadmap is a living document. Priorities shift based on community feedback and ecosystem needs.
> Have a bold idea? Write an [AIP proposal](protocol/AIP-TEMPLATE.md) or start a [Discussion](https://github.com/agtopen/agtopen/discussions).
