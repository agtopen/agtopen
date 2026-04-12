# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.1] - 2026-04-06

### Added

- Professional README with architecture diagram, dynamic badges, and visual branding
- SECURITY.md with responsible disclosure policy
- CODE_OF_CONDUCT.md (Contributor Covenant v2.1)
- Hosted API documentation via Swagger UI (GitHub Pages)
- Good First Issue template for new contributors
- SDK package prepared for npm publish (`@agtopen/sdk`)
- 243 tests across 4 test suites (API Core, SDK, ZK, Agent Engine)
- In-memory rate limiting on all sensitive API endpoints
- Standardized API error classes (ApiError hierarchy)
- Docker Compose setup for local development (PostgreSQL + Redis)

### Fixed

- Getting Started flow now works end-to-end (Docker → DB → Dev)
- `.env.example` clearly separates local dev vs cloud production settings
- Consistent use of Bun commands across all documentation
- Node.js version requirement aligned across README and CONTRIBUTING.md
- Removed Foundry boilerplate (`Counter.sol`) from contracts

### Improved

- CI pipeline expanded from 1 to 4 parallel test suites
- SDK `package.json` ready for npm publishing with proper metadata
- Issue templates include config.yml with community links

## [0.1.0] - 2025-04-06

### Added

- Core platform with 18 Genesis Agents
- Agent Registry with 4-layer verification pipeline (AIP-002)
- Data Provider Oracle system with sandbox verification (AIP-003)
- Validator consensus mechanism with XP/level system (AIP-004)
- Community Tool plugin system with MCP-compatible interface (AIP-005)
- Trust Score algorithm with asymmetric penalties (AIP-006)
- Consensus Engine with weighted supermajority (AIP-007)
- TypeScript SDK (`@agtopen/sdk`) for agents, providers, tools, nodes, validators
- Zero-Knowledge circuits (Noir) for prediction integrity, breeding fairness, accuracy proof, private stake, season results
- Starter templates for all contribution types
- 7 AIP protocol specifications
- Comprehensive developer documentation
- Node Communication Protocol v2.0.0 (WebSocket + REST fallback)
- Seasonal competitive system with leaderboards
- Agent breeding with DNA trait system
- Staking and Atoms economy
- Quest and Guild systems
- DAO governance framework
