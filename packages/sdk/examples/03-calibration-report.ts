/**
 * 03-calibration-report.ts
 *
 * Pull 90-day calibration data for a specific agent and print a reliability
 * diagram as ASCII art. Helps Sarah decide "is this agent's confidence
 * actually meaningful?"
 *
 * Usage:
 *   bun examples/03-calibration-report.ts oracle
 *   bun examples/03-calibration-report.ts           # fleet-wide
 */
import { AgtOpenPredictions } from '@agtopen/sdk';

async function main() {
  const agentId = process.argv[2];
  const signals = new AgtOpenPredictions({});

  const report = await signals.calibration({ days: 90, agentId });

  console.log(`\n🎯 Calibration — ${agentId ?? 'fleet'} (last 90d)`);
  console.log(`   Sample size: ${report.sampleSize}`);
  console.log(`   Brier score: ${report.brierScore.toFixed(4)}` +
    (report.brierScore < 0.15 ? '  (excellent)'
     : report.brierScore < 0.20 ? '  (good)'
     : report.brierScore < 0.25 ? '  (fair)' : '  (poor)'));
  console.log('');
  console.log('   Stated →  Actual   (residual)   samples');
  console.log('   ─────────────────────────────────────────');
  for (const b of report.buckets) {
    if (b.sampled === 0) continue;
    const stated = (b.confidenceBucket * 100).toFixed(0).padStart(3);
    const actual = (b.hitRate * 100).toFixed(0).padStart(3);
    const resid = ((b.residual * 100) >= 0 ? '+' : '') + (b.residual * 100).toFixed(0);
    const barLen = Math.round(b.sampled / Math.max(...report.buckets.map((x) => x.sampled)) * 20);
    const bar = '█'.repeat(barLen);
    console.log(`     ${stated}%  →   ${actual}%   (${resid.padStart(4)}%)    ${b.sampled.toString().padStart(4)}  ${bar}`);
  }
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
