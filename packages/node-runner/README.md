# @agtopen/node-runner

> Turn-key CLI to run an [AgtOpen](https://agtopen.com) compute node. Wraps [`@agtopen/sdk`](../sdk/)'s `AgtOpenNode` with config, banner, and graceful shutdown so a one-liner gets you live.

[![npm](https://img.shields.io/npm/v/@agtopen/node-runner.svg)](https://www.npmjs.com/package/@agtopen/node-runner)
[![license](https://img.shields.io/npm/l/@agtopen/node-runner.svg)](./LICENSE)

---

## 60-second start

```bash
# 1. Grab a JWT. Sign in at https://agtopen.com → Profile →
#    Developer tools → Node token.  (JWTs always start with "eyJ";
#    that prefix is the base64 of {"alg":... — it is NOT a literal
#    value to copy.)
export AGTOPEN_TOKEN="<paste-your-jwt-here>"

# 2. Run the node.
bunx @agtopen/node-runner
# or, equivalently:
npx @agtopen/node-runner
```

That's it. The runner:
1. prints your host capabilities (CPU / RAM / arch),
2. registers with the AgtOpen network,
3. subscribes to the WebSocket task relay,
4. executes incoming tasks and reports heartbeat every 30s,
5. unregisters cleanly on `Ctrl-C` / `SIGTERM`.

### What is `AGTOPEN_TOKEN`?

A **JSON Web Token** (JWT) identifying which AgtOpen account this node
belongs to. Earnings, reputation, and policy limits for the node are
tied to the account the token signs for. Every JWT starts with the
three-character prefix `eyJ` (`{` base64-encoded), followed by two more
base64 segments separated by dots:

```
eyJhbGciOi…   .   eyJzdWIiOi…   .   signature
└─ header ─┘     └─ payload ─┘   └──── proof ────┘
```

If your snippet still has literal `eyJ...` in it, the runner will fail
with `401 Unauthorized` — the three dots mean "put your token here".

## Flags

| Flag | Env | Default | What it does |
|------|-----|---------|--------------|
| `--token <jwt>` | `AGTOPEN_TOKEN` | — | Auth token (required) |
| `--api-url <url>` | `AGTOPEN_API_URL` | `https://api.agtopen.com` | REST base |
| `--relay-url <url>` | `AGTOPEN_RELAY_URL` | `wss://ws.agtopen.com/node` | WebSocket relay |
| `--tier <name>` | `AGTOPEN_TIER` | `hardware` | `browser` · `extension` · `hardware` |
| `--label <string>` | `AGTOPEN_LABEL` | `runner@$hostname` | Shown on the leaderboard |
| `--debug` | — | off | Verbose logging |

## Run as a systemd service

```ini
# /etc/systemd/system/agtopen-node.service
[Unit]
Description=AgtOpen Node Runner
After=network-online.target

[Service]
Environment=AGTOPEN_TOKEN=eyJ...
Environment=AGTOPEN_LABEL=my-datacenter-box
ExecStart=/usr/local/bin/bunx @agtopen/node-runner
Restart=always
RestartSec=10
User=agtopen

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now agtopen-node
journalctl -u agtopen-node -f
```

## Run in Docker

```dockerfile
FROM oven/bun:1.1-alpine
RUN bun add -g @agtopen/node-runner
CMD ["bunx", "@agtopen/node-runner"]
```

```bash
docker run -d --name agtopen-node \
  -e AGTOPEN_TOKEN=eyJ... \
  -e AGTOPEN_LABEL=my-box \
  --restart unless-stopped \
  your-image
```

## Programmatic usage

Prefer to embed the node in your own process? Use the SDK directly:

```ts
import { AgtOpenNode } from '@agtopen/sdk';

const node = new AgtOpenNode({
  token: process.env.AGTOPEN_TOKEN!,
  capabilities: { cpu: 'my-cpu', cores: 8, ramMb: 16384 },
});
await node.start();
```

`@agtopen/node-runner` is a thin wrapper around this; use whichever fits your deployment.

## Links

- Main repo: https://github.com/agtopen/agtopen
- SDK reference: [`packages/sdk/README.md`](../sdk/README.md)
- Node protocol spec: [`AIP-001`](../../protocol/AIP-001-node-protocol.md)

MIT © AgtOpen
