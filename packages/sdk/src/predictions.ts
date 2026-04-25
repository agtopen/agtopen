/**
 * AgtOpenPredictions — read-only client for the prediction / signal API.
 *
 * All methods are plain HTTP GETs; no auth required for public endpoints.
 * Pass the same `AgtOpenConfig` you use elsewhere.
 *
 * ```ts
 * const signals = new AgtOpenPredictions({ apiUrl: 'https://api.agtopen.com' });
 * const { predictions } = await signals.list({ limit: 20 });
 * const stats = await signals.stats(30);
 * const calib = await signals.calibration({ days: 90, agentId: 'oracle' });
 * ```
 */

import { AgtOpenClient } from './client.js';

export interface PredictionListParams {
  limit?: number;
  offset?: number;
  status?: 'pending' | 'correct' | 'wrong';
  market?: string;
}

export interface Prediction {
  id: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  market: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  targetPrice: number | null;
  currentPrice: number | null;
  status: 'pending' | 'correct' | 'wrong';
  agreeCount: number;
  disagreeCount: number;
  createdAt: string;
  expiresAt: string;
  // ── Commit-reveal fields (v0.4.0+) ──
  // commitmentHash is always exposed publicly — it's the binding
  // artifact. The nonce is NOT on this object; fetch `getReveal(id)`
  // once the prediction leaves 'pending' to get it, then pass both
  // to `AgtOpenPredictions.verifyCommitment()` to check independently.
  commitmentHash?: string | null;
  circuitId?: string | null;
  commitmentRevealedAt?: string | null;
  commitmentChainTx?: string | null;
  commitmentBlockNo?: number | null;
}

/**
 * Response from `GET /predictions/:id/reveal`.
 *
 * Returned only after the prediction resolves (`status` ≠ 'pending').
 * While pending, the endpoint returns HTTP 423 Locked — revealing the
 * nonce early would defeat the binding property.
 */
export interface PredictionReveal {
  id: string;
  circuitId: string;
  commitmentHash: string;
  nonce: string;
  preimage: {
    market: string;
    direction: 'LONG' | 'SHORT' | 'NEUTRAL';
    confidence: number;
    targetPrice: number | null;
    currentPrice: number | null;
    reasoning: string;
    timestamp: string;
  };
  /** Pre-joined preimage string — hash this with SHA-256 and compare
   *  to `commitmentHash`. Convenience for thin clients that trust the
   *  server's canonicalisation; the `verifyCommitment()` helper
   *  rebuilds the preimage from `preimage` fields independently. */
  canonicalPreimage: string;
  revealedAt: string;
  verifyHowto: string;
}

export interface PredictionStats {
  windowDays: number;
  total: number;
  correct: number;
  wrong: number;
  pending: number;
  hitRate: number;          // %
  avgConfidence: number;
}

export interface CalibrationBucket {
  confidenceBucket: number;
  low: number;
  high: number;
  sampled: number;
  hitRate: number;
  residual: number;
}

export interface CalibrationReport {
  windowDays: number;
  agentId: string | null;
  sampleSize: number;
  brierScore: number;
  buckets: CalibrationBucket[];
}

export interface PredictionHistoryRow {
  id: string;
  agentId: string;
  agentName: string;
  market: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  currentPrice: number | null;
  targetPrice: number | null;
  outcomePrice: number | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  cumulativePnlUsdc: number;
}

export interface PredictionHistory {
  windowDays: number;
  agentId: string | null;
  market: string | null;
  count: number;
  rows: PredictionHistoryRow[];
}

export class AgtOpenPredictions extends AgtOpenClient {
  /**
   * Verify an agtopen prediction's commitment client-side — the
   * CORE trust primitive this SDK exists to expose.
   *
   * Given the reveal payload from `getReveal(id)`, this re-derives
   * the canonical preimage locally, hashes it with Web Crypto
   * SHA-256, and checks the result against `commitmentHash`. If it
   * matches, the prediction has not been altered since it was
   * created — the commitment was published BEFORE the outcome was
   * known, and the on-chain anchor (`commitmentChainTx`) is the
   * independent timestamp proving that.
   *
   * Runs unchanged on Node 20+, Bun, Deno, browsers, and Cloudflare
   * Workers (Web Crypto only; no Node-specific imports).
   *
   * Returns true iff the recomputed hash exactly matches. The canonical
   * preimage format for `circuitId='sha256_v1'` is:
   *
   *   sha256_v1|<market>|<direction>|<confidence6dp>|<targetPrice6dp>|<currentPrice6dp>|<reasoning>|<timestamp>|<nonce>
   *
   * Unknown `circuitId` values return `false` rather than throwing —
   * older clients may predate a newer scheme; a false negative is
   * strictly safer than a crash in a UI verify button.
   */
  static async verifyCommitment(reveal: PredictionReveal): Promise<boolean> {
    if (reveal.circuitId !== 'sha256_v1') return false;
    const fixed6 = (x: number | null | undefined): string =>
      x == null || Number.isNaN(x) ? '' : x.toFixed(6);
    const ts = reveal.preimage.timestamp;
    // Timestamp coalesces ISO string → epoch ms for hashing, matching
    // the server's `new Date(createdAt).getTime()` canonicalisation
    // in apps/api-core/src/routes/predictions.ts.
    const tsMs = typeof ts === 'string' ? new Date(ts).getTime() : ts;
    const preimage = [
      'sha256_v1',
      reveal.preimage.market,
      reveal.preimage.direction,
      fixed6(reveal.preimage.confidence),
      fixed6(reveal.preimage.targetPrice),
      fixed6(reveal.preimage.currentPrice),
      reveal.preimage.reasoning,
      String(tsMs),
      reveal.nonce,
    ].join('|');
    const encoded = new TextEncoder().encode(preimage);
    const buf = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return hex === reveal.commitmentHash;
  }

  /** List predictions (default 50 most recent). */
  async list(params: PredictionListParams = {}): Promise<{ predictions: Prediction[] }> {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    if (params.status) qs.set('status', params.status);
    if (params.market) qs.set('market', params.market);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.get(`/predictions${suffix}`);
  }

  /** Fetch a single prediction by id, including reasoning + vote counts. */
  async getById(id: string): Promise<{ prediction: Prediction & { reasoning?: string; keyCatalysts?: string[] } }> {
    return this.request('GET', `/predictions/${encodeURIComponent(id)}`);
  }

  /** Vote agree / disagree on a prediction (increments public counter). */
  async vote(id: string, vote: 'agree' | 'disagree'): Promise<{ success: boolean }> {
    return this.post(`/predictions/${encodeURIComponent(id)}/vote`, { vote });
  }

  /**
   * Build a block-explorer URL for a prediction's on-chain anchor.
   * Returns null if the prediction has no `commitmentChainTx` (e.g.
   * still in the cron backlog or pre-anchor row).
   *
   * Currently anchors only on Base Sepolia (chainId 84532), so we
   * always point at basescan; if a future schema change adds Arc
   * Testnet anchors, branch on the chain identifier here.
   */
  static getExplorerUrl(prediction: Pick<Prediction, 'commitmentChainTx'>): string | null {
    if (!prediction.commitmentChainTx) return null;
    return `https://sepolia.basescan.org/tx/${prediction.commitmentChainTx}`;
  }

  /**
   * Fetch the commitment reveal for a resolved prediction. Returns
   * the nonce + canonical preimage so anyone can recompute the
   * SHA-256 and verify the commitment matches.
   *
   * Throws `AgtOpenError` with `status: 423` if called while the
   * prediction is still pending (the nonce is intentionally locked
   * until the outcome is known — that's the whole binding property).
   *
   * After fetching, pass the result to
   * `AgtOpenPredictions.verifyCommitment(reveal)` for the client-side
   * check.
   */
  async getReveal(id: string): Promise<PredictionReveal> {
    return this.get(`/predictions/${encodeURIComponent(id)}/reveal`);
  }

  /**
   * Rolling-window hit rate + Brier-free summary stats. Cheap — use this
   * to power dashboard widgets or README badges.
   */
  async stats(days = 30): Promise<PredictionStats> {
    return this.get(`/predictions/stats?days=${days}`);
  }

  /**
   * Reliability diagram + Brier score per confidence decile. For serious
   * trust evaluation — does the agent's "70%" actually resolve at 70%?
   */
  async calibration(params: { days?: number; agentId?: string } = {}): Promise<CalibrationReport> {
    const qs = new URLSearchParams();
    if (params.days) qs.set('days', String(params.days));
    if (params.agentId) qs.set('agentId', params.agentId);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.get(`/predictions/calibration${suffix}`);
  }

  /**
   * Time-series of predictions with running $100-notional P&L. Feed this
   * into your own backtest harness or charting library.
   */
  async history(params: {
    days?: number;
    agentId?: string;
    market?: string;
    limit?: number;
  } = {}): Promise<PredictionHistory> {
    const qs = new URLSearchParams();
    if (params.days) qs.set('days', String(params.days));
    if (params.agentId) qs.set('agentId', params.agentId);
    if (params.market) qs.set('market', params.market);
    if (params.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.get(`/predictions/history${suffix}`);
  }
}
