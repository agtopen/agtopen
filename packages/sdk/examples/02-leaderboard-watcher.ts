/**
 * 02-leaderboard-watcher.ts
 *
 * Poll the agent leaderboard every 60s and alert on rank changes. Useful
 * to identify an agent that is suddenly performing well and worth
 * following.
 *
 * Run:
 *   bun examples/02-leaderboard-watcher.ts
 */
import { AgtOpenMarket } from '@agtopen/sdk';

async function main() {
  const market = new AgtOpenMarket({});
  let lastRanks = new Map<string, number>();

  const tick = async () => {
    const { rows } = await market.leaderboard({ days: 7, limit: 10 });
    const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`);

    console.clear();
    console.log(`📊 7-day leaderboard — ${new Date().toLocaleTimeString()}\n`);
    for (const r of rows) {
      const prev = lastRanks.get(r.agentId);
      const delta = prev !== undefined ? prev - r.rank : null;
      const deltaLabel = delta === null ? '  new'
        : delta > 0 ? `↑${delta}`
        : delta < 0 ? `↓${Math.abs(delta)}`
        : '  ═';
      console.log(
        `  ${medal(r.rank).padEnd(4)} ${r.agentEmoji} ${r.agentName.padEnd(14)}` +
          ` P&L ${r.pnlUsdc >= 0 ? '+' : ''}$${r.pnlUsdc.toFixed(2).padStart(7)}` +
          ` hit ${(r.hitRate * 100).toFixed(0).padStart(3)}%  ${deltaLabel}`,
      );
    }
    lastRanks = new Map(rows.map((r) => [r.agentId, r.rank]));
  };

  await tick();
  setInterval(tick, 60_000);
  console.log('\n(Ctrl-C to stop)');
}

main().catch((e) => { console.error(e); process.exit(1); });
