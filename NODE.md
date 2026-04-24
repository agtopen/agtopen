# Node Network

The Agentic Open node network is a decentralized compute layer that
powers 18 Genesis Agents. Nodes collect real-time data, verify
predictions, run simulations, and earn Atoms for their contributions.

---

## Three ways to run a node

### 1. Web Node — zero install

Open [agtopen.com/node](https://agtopen.com/node) in any browser.
No download, no config. Your idle browser tab becomes a node.

- Works on desktop, tablet, and mobile
- Uses `< 3%` CPU on typical tasks
- Progresses through the browser tier ladder (`spark → nexus`)

### 2. Extension Node — always on

Install the Chrome extension for background execution — runs even
when the tab is closed.

- Background service-worker execution
- Faster tier progression (higher concurrent task throughput)
- Same tier ladder as the web node

### 3. Hardware Node — VPS / dedicated / GPU

Run a dedicated node on your own server. Two supported paths,
**picked by how you want to deploy**:

| Path | Use when | Env convention |
|---|---|---|
| **npm CLI** `@agtopen/node-runner` | You want a single binary, systemd-friendly, auto-OTP login | `AGTOPEN_*` |
| **Docker** `docker-compose.node.yml` | You want resource limits, restart policies, multi-container | `RELAY_URL`, `NODE_*` |

The two paths run **the same network protocol** but expose different
env-var names — pick one and stay with it. Mixing (e.g. passing
`RELAY_URL` to the npm CLI) is the single most common config bug.

Hardware nodes also progress through a **separate hardware-tier
ladder** (`titan / apex / sovereign`) based on hardware capability +
contribution score — see [Hardware Tiers](#hardware-tiers).

---

## npm CLI — quickest

Installed via `bunx` or `npx` — no repo clone required:

```bash
bunx @agtopen/node-runner
# or
npx @agtopen/node-runner
```

First run prompts for email + OTP and caches the JWT at
`~/.agtopen/token` (chmod 600). Subsequent runs reuse it silently.

### Real CLI output

```
@agtopen/node-runner — run an AgtOpen compute node

Usage:
  bunx @agtopen/node-runner [flags]

Flags:
  --token <jwt>         Auth token (or AGTOPEN_TOKEN env).
                        If absent, prompts for email + OTP and caches JWT.
  --api-url <url>       Override REST base (default: https://api.agtopen.com)
  --relay-url <url>     Override WS relay (default: wss://ws.agtopen.com/node)
  --tier <name>         browser | extension | hardware (default: hardware)
  --label <string>      Human-readable label for the leaderboard
  --logout              Delete the cached token at ~/.agtopen/token and exit
  --debug               Verbose logging
```

Every flag has an env-var fallback; the set the runner actually reads:

| Env | Default |
|---|---|
| `AGTOPEN_TOKEN` | — (prompts if unset) |
| `AGTOPEN_API_URL` | `https://api.agtopen.com` |
| `AGTOPEN_RELAY_URL` | `wss://ws.agtopen.com/node` |
| `AGTOPEN_TIER` | `hardware` |
| `AGTOPEN_LABEL` | `runner@<hostname>` |

For unattended servers, mint a long-lived token at
[agtopen.com/settings → Node token](https://agtopen.com/settings) and
export it as `AGTOPEN_TOKEN`.

### Systemd

```ini
[Unit]
Description=Agentic Open Node
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/bunx @agtopen/node-runner --tier hardware
Environment=AGTOPEN_TOKEN=<long-lived-token>
Environment=AGTOPEN_LABEL=prod-node-01
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## Docker path

```bash
git clone https://github.com/agtopen/agtopen.git
cd agtopen
docker compose -f docker-compose.node.yml up -d
```

Env the Docker node reads (these are **different** from the npm CLI):

```yaml
environment:
  - RELAY_URL=wss://ws.agtopen.com/node
  - API_URL=https://api.agtopen.com
  - NODE_AUTH_TOKEN=<your-jwt>
  - NODE_LABEL=my-vps-node
  - NODE_REGION=auto
  - NODE_TIER=titan              # titan | apex | sovereign
  - ENABLED_TASKS=chain_index,dex_monitor,web_crawl,block_analytics,data_cache
  - MAX_CPU_PERCENT=80
  - MAX_MEMORY_MB=2048
  - TASK_CONCURRENCY=3
  # Optional — only set if you want these task types:
  - OLLAMA_URL=
  - OPENAI_API_KEY=
  - ETH_RPC_URL=https://eth.llamarpc.com
```

The Docker service also enforces OS-level CPU / memory limits via
`deploy.resources.limits` — useful if you want to guarantee the node
never pins a server it shares with other workloads.

---

## Browser tier ladder

Source of truth: [`packages/shared/src/constants/node-tiers.ts`](https://github.com/agtopen/agtopen/blob/main/packages/shared/src/constants/node-tiers.ts).
Three gates must be met **at the same time** to advance — accumulating
tasks alone isn't enough; the network also wants time-in-service and
a clean trust record.

| Tier | Tasks | Days active | Trust score | Multiplier | Daily cap (Atoms) |
|---|---:|---:|---:|---:|---:|
| **spark** | 0 | 0 | ≥ 0.50 | 1.0× | 500 |
| **ember** | 500 | 7 | ≥ 0.60 | 1.1× | 1 500 |
| **blaze** | 2 000 | 30 | ≥ 0.70 | 1.3× | scales |
| **storm** | 10 000 | 90 | ≥ 0.80 | 1.6× | scales |
| **nexus** | 50 000 | 180 | ≥ 0.90 | 2.0× | ceiling |

> Legacy tier names (`seed`/`flame`/`storm`/`vortex`) from the
> original 4-tier design are still **read-compatible** — the server
> migrates old rows to the new ladder on first touch. You only see
> the new names in the UI going forward.

---

## Hardware tiers

Hardware nodes are graded on three axes: **capability** (CPU / RAM /
disk / network / GPU), **SLA** (uptime + response time + task
completion), and **contribution** (days operated, proven reliability).
Source: [`apps/agent-engine/src/node-network/hardware-tiers.ts`](https://github.com/agtopen/agtopen/blob/main/apps/agent-engine/src/node-network/hardware-tiers.ts).

| Tier | Class | Minimum hardware | Min uptime | Multiplier |
|---|---|---|---:|---:|
| **titan** | VPS | 2 CPU, 4 GB RAM, 100 GB SSD, 100 Mbps | 95% | 2.0× |
| **apex** | Dedicated | 8 CPU, 32 GB RAM, 500 GB SSD, 1 Gbps | 99% | 3.0× |
| **sovereign** | GPU | 8 CPU, 64 GB RAM, 1 TB NVMe, GPU ≥ 8 GB VRAM | 99.5% | 4.0× |

A fresh hardware registrant is assessed automatically at registration
and assigned the highest tier its capabilities qualify for. Dropping
below the SLA for the assigned tier downgrades the node at the next
assessment window — you cannot keep a tier the hardware no longer
supports.

---

## Task types

Task names are the exact strings the dispatcher emits; your node
config's `ENABLED_TASKS` must match.

### Browser-executable (13 tasks)

Source: [`apps/web/app/node/executors/`](https://github.com/agtopen/agtopen/tree/main/apps/web/app/node/executors)

| Task | What it does |
|---|---|
| `price_witness` | Fetches BTC / ETH prices from 6 exchanges (Binance, Coinbase, Kraken, OKX, Bybit, KuCoin), returns consensus |
| `protocol_health` | Pings 10 DeFi protocols (Uniswap, Aave, Compound, Lido …) for reachability from your ISP |
| `sentiment_pulse` | Scrapes Reddit + CoinGecko sentiment in your language / region |
| `news_relay` | Aggregates headlines from Reddit / HN / CoinGecko with category + relevance scores |
| `rpc_verify` | Queries 6 Ethereum RPC endpoints and computes consensus hash |
| `macro_data` | Fear & Greed Index, BTC dominance, market cap, gas |
| `platform_health` | GitHub / Cloudflare / AWS / Vercel / npm status from your location |
| `zk_verify` | Verifies zero-knowledge proofs with Web Crypto (SHA-256, ECDSA, Merkle) |
| `swarm_slice` | Multi-agent simulation — 7 strategies, GBM price model |
| `federated_learn` | Local neural-net training with differential privacy; only gradients leave the device |
| `webgpu_inference` | Crypto sentiment classifier on GPU (CPU fallback) |
| `webauthn_attest` | Hardware-backed identity attestation |
| `mev_detect` | Analyses Ethereum blocks for sandwich / frontrun / arbitrage patterns |

### Hardware-only (11 tasks)

Source: [`apps/agent-engine/src/node-network/task-executors.ts`](https://github.com/agtopen/agtopen/blob/main/apps/agent-engine/src/node-network/task-executors.ts)

| Task | Min hardware tier | What it does |
|---|---|---|
| `chain_index` | titan | Index blockchain transactions, classify calls vs transfers |
| `dex_monitor` | titan | Track Uniswap V2 / V3 swap events, detect large trades + MEV patterns |
| `web_crawl` | titan | Scrape crypto news sites (CoinDesk / CoinTelegraph / TheBlock / Decrypt) |
| `data_cache` | titan | LRU cache layer for market data (default 512 MB, TTL eviction) |
| `storage_serve` | titan | Content-addressable storage for historical data |
| `block_analytics` | apex | Analyse gas patterns, MEV extraction, builder activity |
| `cross_chain_bridge` | apex | Monitor Stargate / Wormhole / Across volumes + whale moves |
| `full_node_rpc` | apex | Run blockchain RPC proxy with LRU cache |
| `ai_inference` | sovereign | Run AI models (Ollama / OpenAI / Anthropic) for market analysis |
| `gpu_simulation` | sovereign | Monte-Carlo simulation with VaR95 / CVaR95 (10k+ paths) |
| `zk_batch_prove` | sovereign | Generate batches of ZK proofs for protocol verification |

Hardware nodes can also opt-in to the 7 light browser tasks
(`price_witness`, `protocol_health`, `sentiment_pulse`, `news_relay`,
`rpc_verify`, `swarm_slice`, `zk_verify`) by listing them in
`ENABLED_TASKS` — the dispatcher sends whatever the node asks for.

---

## How rewards work

Per-task Atoms are a product of several factors. The exact formula
lives in
[`apps/api-core/src/services/consensus/pricing.ts`](https://github.com/agtopen/agtopen/blob/main/apps/api-core/src/services/consensus/pricing.ts);
the short version:

```
atoms = baseTask × tierMultiplier × trustWeight × stakeWeight × dailyCapClamp
```

- **baseTask** — fixed per task type; heavier tasks (swarm, GPU, ZK
  batch proving) pay more.
- **tierMultiplier** — browser `1.0×` → `2.0×` (nexus), hardware
  `2.0×` → `4.0×` (sovereign). See tables above.
- **trustWeight** — derived from your node's reputation history
  (`0.0` – `1.5`). Repeatedly agreeing with consensus raises it;
  outliers lower it.
- **stakeWeight** — nodes that lock Atoms back into the staking vault
  earn with a `1 + √(staked/1000)` scalar, capped. See
  [AIP-006](./protocol/AIP-006-trust-score.md).
- **dailyCapClamp** — your remaining Atoms-earning budget for the
  day (tier-scaled; `500` at spark, up to the nexus ceiling).

Once you hit your daily cap, completed tasks still record for
reputation + tier-progress purposes but stop paying until the UTC
day rolls over.

### What the dashboard reports

`/node` shows these per-session counters live:

- Tasks completed (by type)
- Today's Atoms earned vs remaining daily cap
- Trust score + last 20 reputation events
- Tier, tier progress (tasks / days / trust)
- Uptime this session

---

## Data flow

```
Browser / Extension Nodes              Hardware Nodes
(13 task types)                        (11 task types + 7 optional browser)
        │                                      │
        └──────────────────┬───────────────────┘
                           │
                    WebSocket relay
                (apps/ws-server on port 3002)
                           │
                    Dispatch + consensus
        (dedupe, trust-weight, consensus check,
         outlier filter, reputation update)
                           │
                    Agent router
              ┌────┬──────┼──────┬────┐
              ▼    ▼      ▼      ▼    ▼
            Oracle Sentinel  Psyche  Atlas  +14 more
```

Every data point submitted to the relay goes through:

1. **Dedupe** — identical results from the same node inside a short
   window are collapsed.
2. **Consensus** — the dispatcher compares results across nodes and
   picks the majority; non-majority results lose trust-weight.
3. **Outlier filter** — numeric tasks (prices, RPC responses) drop
   results outside `2.5σ` of the consensus.
4. **Reward** — atoms are issued per formula above.
5. **Agent routing** — the accepted result is forwarded to the
   Genesis Agents whose data diet includes that feed.

---

## Resources

- [Run a web node](https://agtopen.com/node) — start in your browser
- [AIP-001 — Node Protocol](./protocol/AIP-001-node-protocol.md) — WebSocket protocol spec
- [AIP-006 — Trust Score](./protocol/AIP-006-trust-score.md) — how trust weight is calculated
- [SDK `AgtOpenNode`](./packages/sdk/) — programmatic integration
- [`@agtopen/node-runner` source](./packages/node-runner/) — CLI wrapper used by `bunx`
