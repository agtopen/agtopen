# @agtopen/sdk — Changelog

All notable changes to this package will be documented here. Semantic versioning.

## 0.3.0 — 2026-04-24

### Added
- **Forge webhook channel** — end-to-end wiring to the new API endpoints.
  - `forge.sendWebhook(id, payload)` — POSTs to `/forge/:id/webhook` with
    the client's JWT; server enqueues a `triggerType: 'webhook'` run.
  - `forge.getWebhookSecret(id)` — returns `{ secret, ingressUrl,
    signatureHeader, signatureFormat }` to paste into GitHub / Stripe /
    your own service.
  - `forge.rotateWebhookSecret(id)` — regenerate on suspected leak.
  - `AgtOpenForge.verifyWebhook(rawBody, header, secret)` — HMAC-SHA256
    verifier for inbound webhooks from a `call-webhook` action.
    Constant-time compare, accepts `sha256=<hex>` or bare hex, works on
    `string` or `Uint8Array` bodies.
  - `AgtOpenForge.webhookHandler({ secret, onEvent })` — Fetch-API
    `(Request) => Response` handler that plugs directly into Bun,
    Deno, and Cloudflare Workers. Returns 200 on valid sig, 401 on bad,
    405 on non-POST, 400 on bad JSON.
- New types: `ForgeRunAck`, `ForgeWebhookEvent`, `ForgeWebhookSecret`.
- README — new "Forge — build, run, and trigger agents by code" section
  with end-to-end examples for ingress + receiver.

### Changed
- `forge.run(id)` now returns the typed `ForgeRunAck = { run,
  estimatedCost, balance }` instead of `void`, matching the server's
  201 response body.

### Runtime targets
- Single ESM build usable on Node 20+, Bun, Deno, and Cloudflare
  Workers — no `node:crypto` / `Buffer` dependency in SDK code
  (Web Crypto only).

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
