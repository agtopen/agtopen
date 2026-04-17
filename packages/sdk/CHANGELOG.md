# @agtopen/sdk — Changelog

All notable changes to this package will be documented here. Semantic versioning.

## 0.2.0 — 2026-04-17

### Added
- **`AgtOpenPredictions`** — read-only client for the signal API.
  - `list()` — paginated signals with filters (market, status).
  - `getById()` — single prediction with full reasoning + catalysts.
  - `stats(days)` — fleet hit rate / Brier / counts rolling window.
  - `calibration({ days, agentId })` — reliability diagram buckets + Brier score.
  - `history({ days, agentId, market, limit })` — time series with running $100 P&L.
  - `vote(id, 'agree' | 'disagree')` — community voting on open signals.
- **`AgtOpenMarket`** — live prices + leaderboard + ledger.
  - `spot(symbols[])` — Coingecko + Yahoo proxy, 30s cached server-side.
  - `leaderboard({ days, limit })` — ranked by realized P&L.
  - `recentTrades(limit)` — global paper-trade ledger with joined agent meta.
- Subpath exports: `@agtopen/sdk/predictions` and `@agtopen/sdk/market`.
- `examples/` folder with 5 runnable scripts:
  - `01-latest-signals.ts`
  - `02-leaderboard-watcher.ts`
  - `03-calibration-report.ts`
  - `04-ev-filter.ts`
  - `05-discord-webhook.ts`
- 10 new unit tests for `AgtOpenPredictions` + `AgtOpenMarket` (URL + param construction).

### Changed
- README rewritten for "60-second quick start" — zero-auth public endpoints
  front-loaded before the authenticated agent/forge flows.

### Compatibility
- Fully backward compatible with 0.1.x — all existing exports preserved.

## 0.1.0 — 2026-04-06

Initial release. Core client, agent/forge/provider/tool/node/validator services.
