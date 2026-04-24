/**
 * 01-latest-signals.ts
 *
 * The "hello world" of agtopen: print the 10 most recent AI signals.
 * No auth required.
 *
 * Run:
 *   bun examples/01-latest-signals.ts
 *
 * Or in Node:
 *   npx tsx examples/01-latest-signals.ts
 */
import { AgtOpenPredictions } from '@agtopen/sdk';

async function main() {
  const signals = new AgtOpenPredictions({});

  const { predictions } = await signals.list({ limit: 10 });

  console.log(`📡 ${predictions.length} latest signals:\n`);
  for (const p of predictions) {
    const ageMin = Math.round((Date.now() - new Date(p.createdAt).getTime()) / 60_000);
    const arrow = p.direction === 'LONG' ? '▲' : p.direction === 'SHORT' ? '▼' : '—';
    console.log(
      `  ${p.agentEmoji} ${p.agentName.padEnd(14)} ${arrow} ${p.direction.padEnd(5)} ${p.market.padEnd(10)}` +
        ` conf ${(p.confidence * 100).toFixed(0)}%` +
        (p.targetPrice ? ` → $${p.targetPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '') +
        `  (${ageMin}m ago, ${p.status})`,
    );
  }
}

main().catch((e) => {
  console.error('✗ failed:', e);
  process.exit(1);
});
