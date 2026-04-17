/**
 * 05-discord-webhook.ts
 *
 * Post every new high-confidence signal to a Discord channel via incoming
 * webhook. Run this as a cron or a small Fly.io worker; it's stateless
 * except for a tiny de-duplication cache.
 *
 * Setup:
 *   1. In Discord, Server Settings → Integrations → Webhooks → New Webhook
 *   2. Copy the URL, set env DISCORD_WEBHOOK
 *   3. Run:  DISCORD_WEBHOOK=https://… bun examples/05-discord-webhook.ts
 */
import { AgtOpenPredictions } from '@agtopen/sdk';

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;
const MIN_CONF = parseFloat(process.env.MIN_CONF ?? '0.65');
const POLL_MS = parseInt(process.env.POLL_MS ?? '60000');

if (!DISCORD_WEBHOOK) {
  console.error('✗ Set DISCORD_WEBHOOK env');
  process.exit(1);
}

const seen = new Set<string>();
const signals = new AgtOpenPredictions({});

async function postToDiscord(p: any) {
  const color = p.direction === 'LONG' ? 0x10B981 : 0xEF4444;
  const embed = {
    title: `${p.agentEmoji} ${p.agentName}: ${p.direction} ${p.market}`,
    color,
    fields: [
      { name: 'Confidence', value: `${(p.confidence * 100).toFixed(0)}%`, inline: true },
      { name: 'Target', value: p.targetPrice ? `$${p.targetPrice.toLocaleString()}` : '—', inline: true },
      { name: 'Expires', value: `<t:${Math.floor(new Date(p.expiresAt).getTime()/1000)}:R>`, inline: true },
    ],
    footer: { text: 'agtopen.com' },
    timestamp: p.createdAt,
  };
  await fetch(DISCORD_WEBHOOK!, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
  console.log(`  → posted ${p.id}`);
}

async function tick() {
  try {
    const { predictions } = await signals.list({ limit: 20, status: 'pending' });
    for (const p of predictions) {
      if (seen.has(p.id)) continue;
      if (p.confidence < MIN_CONF) continue;
      const age = Date.now() - new Date(p.createdAt).getTime();
      if (age > 5 * 60_000) {
        seen.add(p.id); // too old to announce, but mark seen so we don't re-check
        continue;
      }
      await postToDiscord(p);
      seen.add(p.id);
    }
    // Cap memory
    if (seen.size > 500) {
      const arr = Array.from(seen); seen.clear();
      for (const id of arr.slice(-200)) seen.add(id);
    }
  } catch (err) {
    console.error('poll failed:', err);
  }
}

console.log(`📡 Watching for conf ≥${(MIN_CONF*100).toFixed(0)}% signals, posting to Discord...`);
tick();
setInterval(tick, POLL_MS);
