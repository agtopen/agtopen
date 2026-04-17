/**
 * Smoke tests for the read-only clients. Mocks fetch so we don't hit a
 * real API — we're just verifying URL construction + return shape.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AgtOpenPredictions } from '../predictions';
import { AgtOpenMarket } from '../market';

let capturedUrl = '';
let capturedMethod = '';
let responseStub: unknown = {};
let originalFetch: typeof fetch;

beforeEach(() => {
  capturedUrl = '';
  capturedMethod = '';
  originalFetch = global.fetch;
  global.fetch = (async (url: any, init?: any) => {
    capturedUrl = typeof url === 'string' ? url : url.toString();
    capturedMethod = init?.method ?? 'GET';
    return {
      ok: true,
      status: 200,
      json: async () => responseStub,
    };
  }) as any;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('AgtOpenPredictions', () => {
  test('list() builds correct URL with params', async () => {
    responseStub = { predictions: [] };
    const c = new AgtOpenPredictions({ apiUrl: 'https://api.example.com' });
    await c.list({ limit: 25, status: 'pending', market: 'BTC/USD' });
    expect(capturedUrl).toContain('/predictions?');
    expect(capturedUrl).toContain('limit=25');
    expect(capturedUrl).toContain('status=pending');
    expect(capturedUrl).toContain('market=BTC');
  });

  test('stats() uses default 30d', async () => {
    responseStub = { windowDays: 30, total: 0, correct: 0, wrong: 0, pending: 0, hitRate: 0, avgConfidence: 0 };
    const c = new AgtOpenPredictions({});
    await c.stats();
    expect(capturedUrl).toContain('/predictions/stats?days=30');
  });

  test('calibration() includes agentId when set', async () => {
    responseStub = { windowDays: 90, agentId: 'oracle', sampleSize: 0, brierScore: 0, buckets: [] };
    const c = new AgtOpenPredictions({});
    await c.calibration({ days: 90, agentId: 'oracle' });
    expect(capturedUrl).toContain('/predictions/calibration');
    expect(capturedUrl).toContain('agentId=oracle');
    expect(capturedUrl).toContain('days=90');
  });

  test('history() omits falsy params', async () => {
    responseStub = { windowDays: 90, agentId: null, market: null, count: 0, rows: [] };
    const c = new AgtOpenPredictions({});
    await c.history({ days: 30 });
    expect(capturedUrl).toContain('/predictions/history?');
    expect(capturedUrl).toContain('days=30');
    expect(capturedUrl).not.toContain('agentId=');
    expect(capturedUrl).not.toContain('market=');
  });

  test('vote() posts', async () => {
    responseStub = { success: true };
    const c = new AgtOpenPredictions({});
    await c.vote('abc-123', 'agree');
    expect(capturedUrl).toContain('/predictions/abc-123/vote');
    expect(capturedMethod).toBe('POST');
  });

  test('uses default api url when not provided', async () => {
    responseStub = { predictions: [] };
    const c = new AgtOpenPredictions({});
    await c.list();
    expect(capturedUrl).toContain('https://api.agtopen.com/predictions');
  });
});

describe('AgtOpenMarket', () => {
  test('spot() batches symbols into query', async () => {
    responseStub = { quotes: [] };
    const m = new AgtOpenMarket({});
    await m.spot(['BTC', 'ETH', 'SPY']);
    expect(capturedUrl).toContain('/market/spot?symbols=');
    expect(decodeURIComponent(capturedUrl)).toContain('BTC,ETH,SPY');
  });

  test('leaderboard() default has no query params', async () => {
    responseStub = { windowDays: 7, count: 0, rows: [] };
    const m = new AgtOpenMarket({});
    await m.leaderboard();
    expect(capturedUrl).toMatch(/\/agents\/leaderboard(\?|$)/);
  });

  test('leaderboard() accepts days + limit', async () => {
    responseStub = { windowDays: 30, count: 0, rows: [] };
    const m = new AgtOpenMarket({});
    await m.leaderboard({ days: 30, limit: 50 });
    expect(capturedUrl).toContain('days=30');
    expect(capturedUrl).toContain('limit=50');
  });

  test('recentTrades() uses default limit 50', async () => {
    responseStub = { trades: [], stats: { total: 0, wins: 0, losses: 0, open: 0, winRate: 0, totalPnlUsdc: 0, totalVolume: 0 } };
    const m = new AgtOpenMarket({});
    await m.recentTrades();
    expect(capturedUrl).toContain('/trades/recent?limit=50');
  });
});
