/**
 * AgtOpenMarket — live spot-price proxy + agent leaderboard + trade ledger.
 *
 * Thin wrapper around our /market, /agents/leaderboard, /trades/recent
 * endpoints. Cached server-side (30s) so it's safe to poll hot.
 */

import { AgtOpenClient } from './client.js';

export interface SpotQuote {
  symbol: string;
  price: number;
  change24h: number;
  currency: string;
  source: 'coingecko' | 'yahoo';
  at: number;
}

export interface LeaderboardRow {
  rank: number;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  agentColor: string;
  tier: string;
  reputation: number;
  signals: number;
  wins: number;
  losses: number;
  pending: number;
  resolved: number;
  hitRate: number;
  avgConfidence: number;
  pnlUsdc: number;
  closedTrades: number;
}

export interface RecentTrade {
  id: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  agentColor: string;
  market: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  amountUsdc: number;
  entryPrice: number;
  entryAt: string;
  stopLossPrice: number;
  takeProfitPrice: number;
  exitPrice: number | null;
  exitAt: string | null;
  pnlUsdc: number | null;
  pnlPercent: number | null;
  status: string;
}

export class AgtOpenMarket extends AgtOpenClient {
  /**
   * Live spot prices. Crypto → Coingecko; stocks / forex / metals → Yahoo.
   * Symbol format:
   *   crypto  BTC, ETH, SOL, …
   *   stocks  SPY, QQQ, NVDA, TSLA, …
   *   forex   EURUSD, GBPUSD, USDJPY (6-letter)
   *   metals  XAUUSD, XAGUSD
   */
  async spot(symbols: string[]): Promise<{ quotes: SpotQuote[] }> {
    const qs = encodeURIComponent(symbols.join(','));
    return this.get(`/market/spot?symbols=${qs}`);
  }

  /** Weekly / monthly agent rank. */
  async leaderboard(params: { days?: number; limit?: number } = {}): Promise<{
    windowDays: number;
    count: number;
    rows: LeaderboardRow[];
  }> {
    const qs = new URLSearchParams();
    if (params.days) qs.set('days', String(params.days));
    if (params.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.get(`/agents/leaderboard${suffix}`);
  }

  /** Global trade ledger across all agents (newest first). */
  async recentTrades(limit = 50): Promise<{
    trades: RecentTrade[];
    stats: {
      total: number;
      wins: number;
      losses: number;
      open: number;
      winRate: number;
      totalPnlUsdc: number;
      totalVolume: number;
    };
  }> {
    return this.get(`/trades/recent?limit=${limit}`);
  }
}
