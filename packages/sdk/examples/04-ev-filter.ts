/**
 * 04-ev-filter.ts
 *
 * Filter today's signals to only high-EV setups worth acting on.
 * Useful as the core of a trading bot or Discord alert.
 *
 *   EV = p×W - (1-p)×L  — here we assume symmetric ±2% payoff
 *   Half-Kelly = (bp - q) / b × 0.5   — capped at 25% of bankroll
 *
 * Run:
 *   bun examples/04-ev-filter.ts
 *   MIN_CONF=0.70 MIN_EV=1.0 bun examples/04-ev-filter.ts
 */
import { AgtOpenPredictions } from '@agtopen/sdk';

const MIN_CONF = parseFloat(process.env.MIN_CONF ?? '0.65');
const MIN_EV = parseFloat(process.env.MIN_EV ?? '0.5');

function ev(conf: number, winPct = 2, lossPct = 2): number {
  return (conf * winPct) - ((1 - conf) * lossPct);
}

function halfKelly(conf: number): number {
  const b = 1; // symmetric R/R
  const f = (b * conf - (1 - conf)) / b;
  return Math.max(0, Math.min(0.25, f * 0.5));
}

async function main() {
  const signals = new AgtOpenPredictions({});
  const { predictions } = await signals.list({ limit: 80, status: 'pending' });

  const filtered = predictions
    .filter((p) => p.confidence >= MIN_CONF && ev(p.confidence) >= MIN_EV)
    .sort((a, b) => ev(b.confidence) - ev(a.confidence));

  console.log(`📡 ${filtered.length} high-EV signals (conf ≥${(MIN_CONF*100).toFixed(0)}%, EV ≥$${MIN_EV.toFixed(2)}/\$100):\n`);
  for (const p of filtered) {
    const signalEV = ev(p.confidence);
    const kelly = halfKelly(p.confidence);
    console.log(
      `  ${p.agentEmoji} ${p.market.padEnd(10)} ${p.direction.padEnd(5)}` +
        ` conf ${(p.confidence*100).toFixed(0)}%` +
        ` EV +$${signalEV.toFixed(2)}` +
        ` Half-Kelly ${(kelly*100).toFixed(1)}%` +
        (p.targetPrice ? `  target $${p.targetPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''),
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
