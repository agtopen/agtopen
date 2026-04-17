#!/usr/bin/env node
/**
 * @agtopen/node-runner — turn-key CLI for the AgtOpen node network.
 *
 * Usage:
 *   bunx @agtopen/node-runner
 *
 * Configuration (env or flags):
 *   AGTOPEN_TOKEN     JWT from the web app (/profile → dev tools)     [required]
 *   AGTOPEN_API_URL   Override API base (default: https://api.agtopen.com)
 *   AGTOPEN_RELAY_URL Override WS relay (default: wss://ws.agtopen.com/node)
 *   AGTOPEN_TIER      browser | extension | hardware  (default: hardware)
 *   AGTOPEN_LABEL     Human-readable label shown on the leaderboard
 *
 * Flags mirror envs: --token, --api-url, --relay-url, --tier, --label, --debug
 *
 * The runner:
 *   1. Prints banner + detected capabilities (CPU / RAM / GPU)
 *   2. Registers the node with the AgtOpen network
 *   3. Subscribes to the WebSocket relay for incoming tasks
 *   4. Executes each task via the SDK's built-in executors
 *   5. Reports heartbeat every 30s, restarts on reconnect
 *   6. Graceful shutdown on SIGINT/SIGTERM (unregisters cleanly)
 */

import { AgtOpenNode } from '@agtopen/sdk';
import os from 'node:os';
import { argv, env, exit } from 'node:process';
import { resolveToken, removeCachedToken } from './auth.js';

interface Flags {
  token?: string;
  apiUrl?: string;
  relayUrl?: string;
  tier?: string;
  label?: string;
  logout?: boolean;
  debug?: boolean;
  help?: boolean;
  version?: boolean;
}

function parseFlags(args: string[]): Flags {
  const out: Flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--version' || a === '-v') out.version = true;
    else if (a === '--debug') out.debug = true;
    else if (a.startsWith('--token=')) out.token = a.slice(8);
    else if (a === '--token') out.token = args[++i];
    else if (a.startsWith('--api-url=')) out.apiUrl = a.slice(10);
    else if (a === '--api-url') out.apiUrl = args[++i];
    else if (a.startsWith('--relay-url=')) out.relayUrl = a.slice(12);
    else if (a === '--relay-url') out.relayUrl = args[++i];
    else if (a.startsWith('--tier=')) out.tier = a.slice(7);
    else if (a === '--tier') out.tier = args[++i];
    else if (a.startsWith('--label=')) out.label = a.slice(8);
    else if (a === '--label') out.label = args[++i];
    else if (a === '--logout') out.logout = true;
  }
  return out;
}

function printHelp(): void {
  process.stdout.write(`
@agtopen/node-runner — run an AgtOpen compute node

Usage:
  bunx @agtopen/node-runner [flags]
  npx  @agtopen/node-runner [flags]

Flags:
  --token <jwt>         Auth token (or AGTOPEN_TOKEN env).
                        If absent, the runner will prompt for email + OTP
                        and cache the resulting JWT at ~/.agtopen/token.
  --api-url <url>       Override REST base (default: https://api.agtopen.com)
  --relay-url <url>     Override WS relay (default: wss://ws.agtopen.com/node)
  --tier <name>         browser | extension | hardware (default: hardware)
  --label <string>      Human-readable label for the leaderboard
  --logout              Delete the cached token at ~/.agtopen/token and exit
  --debug               Verbose logging
  --help                This screen
  --version             Print version

Get a token:
  Option A — generate one at https://agtopen.com/settings → Node token
  Option B — just run this command; you'll be prompted for email + OTP

Docs:
  https://github.com/agtopen/agtopen/tree/main/packages/node-runner
`);
}

function banner(): void {
  const cpu = os.cpus()[0]?.model ?? 'unknown CPU';
  const cores = os.cpus().length;
  const ramGb = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  process.stdout.write(`
┌────────────────────────────────────────────────────────┐
│  ◆  AgtOpen Node Runner v0.1.0                         │
│                                                        │
│  Host     ${os.hostname().padEnd(44)}│
│  CPU      ${String(cpu).slice(0, 44).padEnd(44)}│
│  Cores    ${String(cores).padEnd(44)}│
│  RAM      ${`${ramGb} GB`.padEnd(44)}│
│  Platform ${`${os.platform()} ${os.arch()}`.padEnd(44)}│
└────────────────────────────────────────────────────────┘
`);
}

async function main(): Promise<void> {
  const flags = parseFlags(argv.slice(2));

  if (flags.help) { printHelp(); return; }
  if (flags.version) { process.stdout.write('0.1.0\n'); return; }
  if (flags.logout) {
    await removeCachedToken();
    process.stdout.write('  ✓ Cached token removed (~/.agtopen/token).\n');
    return;
  }

  const apiUrl = flags.apiUrl ?? env.AGTOPEN_API_URL;
  const explicitToken = flags.token ?? env.AGTOPEN_TOKEN;

  // Resolves in this order:
  //   1. --token / AGTOPEN_TOKEN (explicit)
  //   2. ~/.agtopen/token (cached; validated against /auth/me first)
  //   3. Interactive email → OTP prompt (TTY only)
  let token: string;
  try {
    token = await resolveToken(explicitToken, apiUrl);
  } catch (err) {
    process.stderr.write(`✗ Could not authenticate: ${(err as Error).message}\n`);
    exit(1);
  }
  const relayUrl = flags.relayUrl ?? env.AGTOPEN_RELAY_URL ?? 'wss://ws.agtopen.com/node';
  const tier = (flags.tier ?? env.AGTOPEN_TIER ?? 'hardware') as 'browser' | 'extension' | 'hardware';
  const label = flags.label ?? env.AGTOPEN_LABEL ?? `runner@${os.hostname()}`;

  banner();
  process.stdout.write(`  Token:    ${token.slice(0, 8)}…${token.slice(-4)}\n`);
  process.stdout.write(`  Tier:     ${tier}\n`);
  process.stdout.write(`  Label:    ${label}\n`);
  process.stdout.write(`  Relay:    ${relayUrl}\n\n`);

  const node = new AgtOpenNode({
    token,
    apiUrl,
    debug: flags.debug ?? false,
    capabilities: {
      tier,
      label,
      cpu: os.cpus()[0]?.model ?? 'unknown',
      cores: os.cpus().length,
      ramMb: Math.round(os.totalmem() / 1024 / 1024),
      platform: os.platform(),
      arch: os.arch(),
    } as any,
    onTask: async (task) => {
      if (flags.debug) process.stdout.write(`  · task ${task.taskId} received\n`);
      // Default implementation: acknowledge receipt.
      // Custom executors for specific capabilities plug in via the SDK.
      return {
        taskId: task.taskId,
        result: { acknowledged: true },
        timestamp: Date.now(),
      };
    },
  });

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`\n  ${signal} received — unregistering node…\n`);
    try {
      await (node as any).stop?.();
    } catch { /* noop */ }
    process.stdout.write('  bye ✦\n');
    exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.stdout.write('  Registering with network…\n');
  try {
    await node.start();
    process.stdout.write('  ✓ Connected · listening for tasks\n');
    process.stdout.write('  (Ctrl-C to stop)\n\n');
  } catch (err) {
    process.stderr.write(`  ✗ Failed to register: ${(err as Error).message}\n`);
    exit(1);
  }

  // Keep the event loop alive indefinitely
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err}\n`);
  exit(1);
});
