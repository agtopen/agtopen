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

import { AgtOpenClient } from './client';

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
