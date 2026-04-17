# Node Network

The Agentic Open node network is a decentralized compute layer that powers 18 autonomous AI agents. Nodes collect real-time data, verify predictions, run simulations, and earn Atoms for their contributions.

## Three Ways to Run a Node

### 1. Web Node --- Zero Install

Open [agtopen.com/node](https://agtopen.com/node) in any browser. No downloads, no configuration. Your idle browser tab becomes a node.

- Works on desktop, tablet, and mobile
- Uses < 3% CPU
- Earns Atoms every task cycle

### 2. Extension Node --- Always On

Install the Chrome Extension for persistent background operation. Runs when your browser is open, even when the tab is closed.

- Background service worker execution
- Higher tier eligibility (up to Vortex)
- 1.2x reward multiplier vs web nodes

### 3. Hardware Node --- VPS / Dedicated / GPU

Run a dedicated node on your own server. Supports Bun CLI, Docker, and systemd.

```bash
# Clone and run
git clone https://github.com/agtopen/agtopen.git && cd agtopen && bun install
RELAY_URL=wss://ws.agtopen.com/node bunx @agtopen/node-runner  # coming soon; see ./packages/sdk for AgtOpenNode
```

Hardware nodes handle compute-intensive tasks like blockchain indexing, AI inference, and ZK proof generation. See [Deploy a Hardware Node](#deploy-a-hardware-node) for full setup.

---

## How Rewards Work

Rewards are calculated using a multi-factor formula that values quality over quantity:

```
reward = basePoints x taskWeight x qualityScore x tierMultiplier x uptimeBonus x diminishingFactor
```

**What each factor means:**

| Factor | Range | Description |
|--------|-------|-------------|
| **Base Points** | Fixed per cycle | Every completed task earns a base amount of Atoms |
| **Task Weight** | 1.0 - 2.5x | Harder tasks pay more (light=1.0, medium=1.5, heavy=2.0, compute=2.5) |
| **Quality Score** | 0.5 - 1.5x | How accurate your data is compared to network consensus |
| **Tier Multiplier** | 1.0 - 2.0x | Higher tiers earn more per task (see tier tables below) |
| **Uptime Bonus** | 1.0 - 1.2x | Consistent uptime streaks are rewarded |
| **Diminishing Factor** | Logarithmic | Prevents any single node from dominating the reward pool |

### Quality Bonuses

Your node earns bonus rewards for high-quality contributions:

- **Consensus agreement** --- Your data matches the network majority (+10%)
- **Regional uniqueness** --- You provide data from an underserved locale (+15%)
- **First responder** --- You submit results fastest (+5%)
- **Data freshness** --- Data submitted within seconds of collection (+5%)

A well-run browser node in a unique region can be highly competitive with basic hardware nodes.

### Diminishing Returns

To keep the network fair and prevent any single operator from dominating:

- **First 8 hours/day**: Full reward rate
- **8-16 hours/day**: 80% reward rate
- **16-24 hours/day**: 60% reward rate

This ensures that running a single VPS 24/7 does not produce outsized returns compared to active browser node operators.

---

## Task Types

Nodes execute tasks assigned by the relay server. Each task feeds real-time data to one or more of the 18 Genesis Agents.

### Browser Tasks (Web Node + Extension)

| Task | Reward Level | What It Does | Feeds Agent |
|------|-------------|-------------|-------------|
| **Price Witness** | Low | Fetches BTC/ETH prices from 6 exchanges (Binance, Coinbase, Kraken, OKX, Bybit, KuCoin) | Oracle, Quant |
| **Protocol Health** | Low | Checks 10 DeFi protocols (Uniswap, Aave, Compound, Lido...) accessibility from your ISP | Sentinel, DeepMind |
| **Sentiment Pulse** | Medium | Scrapes Reddit + CoinGecko for crypto sentiment in your language/region | Psyche, Specter |
| **News Relay** | Medium | Aggregates headlines from Reddit, Hacker News, CoinGecko with category + relevance scoring | Atlas, Hermes |
| **RPC Verify** | Medium | Queries 6 Ethereum RPC endpoints and computes consensus hash | Cipher |
| **Macro Data** | Medium | Fetches Fear & Greed Index, BTC dominance, market cap, gas prices | Meridian, Quant |
| **Platform Health** | Low | Checks GitHub, Cloudflare, AWS, Vercel, npm status from your location | Sentinel |
| **ZK Verify** | High | Verifies zero-knowledge proofs using Web Crypto API (SHA-256, ECDSA, Merkle proofs) | Protocol-wide |
| **Swarm Slice** | Very High | Runs multi-agent simulation with 7 strategies and GBM price model | Oracle |
| **Federated Learn** | High | Trains local neural network with differential privacy, sends only gradients | Protocol-wide |
| **WebGPU Inference** | High | Runs crypto sentiment classifier on GPU (CPU fallback) | Psyche, Oracle |
| **WebAuthn Attest** | Medium | Hardware-backed identity attestation | Protocol-wide |
| **MEV Detect** | High | Analyzes Ethereum blocks for sandwich attacks, frontrunning, arbitrage | Cipher, Abyss |

### Hardware Tasks (VPS / GPU Only)

| Task | Reward Level | Min Tier | What It Does |
|------|-------------|----------|-------------|
| **Chain Index** | High | Titan | Index blockchain transactions, classify contract calls vs transfers |
| **DEX Monitor** | High | Titan | Track Uniswap V2/V3 swap events, detect large trades + MEV patterns |
| **Web Crawl** | Medium | Titan | Scrape crypto news sites (CoinDesk, CoinTelegraph, TheBlock, Decrypt) |
| **Data Cache** | Medium | Titan | LRU cache layer for market data (512MB, TTL eviction) |
| **Storage Serve** | Medium | Titan | Content-addressable storage for historical data |
| **Full Node RPC** | Very High | Apex | Run blockchain RPC proxy with LRU cache |
| **Block Analytics** | High | Apex | Analyze gas patterns, MEV extraction, builder activity |
| **Cross-Chain Bridge** | High | Apex | Monitor Stargate, Wormhole, Across bridge volumes + whale movements |
| **AI Inference** | Very High | Sovereign | Run AI models (Ollama/OpenAI/Claude) for market analysis |
| **GPU Simulation** | Very High | Sovereign | Monte Carlo simulation with VaR95/CVaR95 (10K+ paths) |
| **ZK Batch Prove** | Very High | Sovereign | Generate batches of ZK proofs for protocol verification |

---

## Browser Tier Progression

Browser nodes progress through tiers by completing tasks:

| Tier | Tasks Required | Tier Multiplier | Unlocked Task Types |
|------|---------------|----------------|-------------------|
| **Seed** | 0 | 1.0x | Price Witness, Protocol Health |
| **Flame** | 100 | 1.1x | + Sentiment Pulse, News Relay |
| **Storm** | 500 | 1.2x | + RPC Verify, ZK Verify |
| **Vortex** | 2,000 | 1.3x | + Swarm Slice (all types) |

Extension nodes receive a 1.2x multiplier on top of their browser tier. For example, a Vortex Extension node earns at 1.56x (1.3 x 1.2).

---

## Hardware Tiers

Hardware tiers are determined by your node's hardware capability and contribution history. Higher tiers require sustained, reliable operation over time.

| Tier | Type | Hardware Requirements | Contribution Score | Reward Multiplier |
|------|------|---------------------|-------------------|------------------|
| **Titan** | VPS | 2 CPU, 4GB RAM, 100GB SSD, 100Mbps | Entry level | 2.0x |
| **Apex** | Dedicated | 8 CPU, 32GB RAM, 500GB SSD, 1Gbps | Established operator | 3.0x |
| **Sovereign** | GPU | 8 CPU, 64GB RAM, 1TB NVMe, GPU 8GB+ | Proven track record | 4.0x |

**Contribution Score** is built over time through:
- Consistent uptime meeting SLA requirements (Titan 95%, Apex 99%, Sovereign 99.5%)
- High task completion rate
- Data quality and consensus agreement
- Duration of reliable operation

New hardware operators start at Titan and advance through demonstrated reliability, not by spending more.

---

## Data Flow

```
Browser/Extension Nodes              Hardware Nodes
(14 task types)                      (11 task types)
        |                                   |
        +------------------+----------------+
                           |
                    Relay Server
                   (WebSocket + Redis)
                           |
                    Data Pipeline
                (dedup, consensus, outlier detection)
                           |
                    Agent Router
             +------+------+------+------+
             |      |      |      |      |
          Oracle Sentinel Psyche Atlas  +13 more
           91%    95%     80%    78%   agents
```

Every data point is:
1. **Deduplicated** (60s window)
2. **Weighted** by node trust score
3. **Consensus-checked** (66% agreement threshold)
4. **Outlier-filtered** (2.5 sigma)
5. **Routed** to the appropriate agent based on data type

---

## Deploy a Hardware Node

All nodes connect to `wss://ws.agtopen.com/node` --- the production relay server.

### Bun CLI (Quickest)

```bash
git clone https://github.com/agtopen/agtopen.git
cd agtopen
bun install

RELAY_URL=wss://ws.agtopen.com/node \
bunx @agtopen/node-runner  # coming soon; see ./packages/sdk for AgtOpenNode
```

The node auto-detects your system capabilities (CPU, RAM, GPU) and connects to the relay. You'll see:

```
[NodeRunner] System: 4 CPUs, 7.7 GB RAM, No GPU
[NodeRunner] Connecting to wss://ws.agtopen.com/node...
[NodeRunner] Handshake accepted. Node: dbcd620d, Tier: titan, Tasks: 24
[NodeRunner] Ready. Waiting for tasks...
```

### Docker Compose

```bash
git clone https://github.com/agtopen/agtopen.git
cd agtopen
docker compose -f docker-compose.node.yml up -d
```

Configure via environment variables in `docker-compose.node.yml`:

```yaml
environment:
  - RELAY_URL=wss://ws.agtopen.com/node
  - NODE_LABEL=my-vps-node
  - ENABLED_TASKS=chain_index,dex_monitor,web_crawl,block_analytics,data_cache
  - MAX_CPU_PERCENT=80
  - MAX_MEMORY_MB=2048
```

### Systemd (Background Service)

```ini
[Unit]
Description=Agentic Open Node
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/agtopen
ExecStart=/usr/local/bin/bunx @agtopen/node-runner  # coming soon; see ./packages/sdk for AgtOpenNode
Restart=always
Environment=RELAY_URL=wss://ws.agtopen.com/node

[Install]
WantedBy=multi-user.target
```

---

## Resources

- [Run a Web Node](https://agtopen.com/node) --- Start in your browser
- [AIP-001: Node Protocol](./protocol/AIP-001-node-protocol.md) --- WebSocket protocol specification
- [AIP-006: Trust Score](./protocol/AIP-006-trust-score.md) --- How node trust is calculated
- [SDK Node Module](./packages/sdk/) --- Programmatic node integration
