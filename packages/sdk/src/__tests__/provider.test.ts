import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { AgtOpenProvider } from '../provider';
import type { ProviderConfig } from '../types';

describe('AgtOpenProvider', () => {
  const originalFetch = globalThis.fetch;
  let provider: AgtOpenProvider;
  let port: number;

  const BASE_PORT = 18200;
  let portCounter = 0;

  function nextPort(): number {
    return BASE_PORT + portCounter++;
  }

  function createMockFetch(port: number) {
    return mock(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      // Let local requests through to the real server
      if (urlStr.startsWith(`http://localhost:${port}`)) {
        return originalFetch(url, init);
      }

      // Mock API registration
      if (urlStr.includes('/data-providers/register')) {
        return new Response(JSON.stringify({ id: 'provider-test-id', status: 'sandbox' }));
      }

      // Mock heartbeat
      if (urlStr.includes('/heartbeat')) {
        return new Response(JSON.stringify({ ok: true }));
      }

      return new Response(JSON.stringify({ error: 'not mocked' }), { status: 500 });
    });
  }

  afterEach(async () => {
    if (provider) {
      await provider.stop();
    }
    globalThis.fetch = originalFetch;
  });

  // ── start() ──

  describe('start()', () => {
    test('starts server on correct port and registers', async () => {
      port = nextPort();
      const mockFetch = createMockFetch(port);
      globalThis.fetch = mockFetch;

      provider = new AgtOpenProvider({
        name: 'TestProvider',
        description: 'A test provider',
        type: 'price_feed',
        token: 'test-token',
        port,
        onData: async () => ({ price: 100 }),
      });

      const result = await provider.start();

      expect(result.id).toBe('provider-test-id');
      expect(result.status).toBe('sandbox');
    });

    test('registers with correct body', async () => {
      port = nextPort();
      const mockFetch = createMockFetch(port);
      globalThis.fetch = mockFetch;

      provider = new AgtOpenProvider({
        name: 'PriceFeed',
        description: 'Real-time prices',
        type: 'price_feed',
        emoji: '$',
        tags: ['crypto', 'defi'],
        updateFrequencyMs: 5000,
        outputSchema: { price: 'number', symbol: 'string' },
        token: 'test-token',
        port,
        onData: async () => ({ price: 100 }),
      });

      await provider.start();

      const registrationCall = mockFetch.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('/data-providers/register')
      );
      expect(registrationCall).toBeDefined();

      const [, init] = registrationCall as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.name).toBe('PriceFeed');
      expect(body.description).toBe('Real-time prices');
      expect(body.type).toBe('price_feed');
      expect(body.emoji).toBe('$');
      expect(body.tags).toEqual(['crypto', 'defi']);
      expect(body.dataFormat).toBe('json');
      expect(body.updateFrequencyMs).toBe(5000);
      expect(body.outputSchema).toEqual({ price: 'number', symbol: 'string' });
      expect(body.endpointUrl).toBe(`http://localhost:${port}`);
    });

    test('uses default values for optional fields', async () => {
      port = nextPort();
      const mockFetch = createMockFetch(port);
      globalThis.fetch = mockFetch;

      provider = new AgtOpenProvider({
        name: 'Defaults',
        description: 'Default test',
        type: 'custom',
        token: 'test-token',
        port,
        onData: async () => ({}),
      });

      await provider.start();

      const registrationCall = mockFetch.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('/data-providers/register')
      );
      const [, init] = registrationCall as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.emoji).toBe('\u{1F4E1}'); // satellite emoji
      expect(body.tags).toEqual([]);
      expect(body.updateFrequencyMs).toBe(60000);
      expect(body.outputSchema).toEqual({});
    });
  });

  // ── HTTP Server ──

  describe('HTTP server', () => {
    test('GET /health returns health status', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      provider = new AgtOpenProvider({
        name: 'HealthProvider',
        description: 'Health test',
        type: 'price_feed',
        token: 'test-token',
        port,
        onData: async () => ({ price: 50 }),
      });

      await provider.start();

      const res = await originalFetch(`http://localhost:${port}/health`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.provider).toBe('HealthProvider');
      expect(data.timestamp).toBeNumber();
    });

    test('GET /health uses custom onHealthCheck when provided', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      provider = new AgtOpenProvider({
        name: 'CustomHealthProvider',
        description: 'Custom health',
        type: 'price_feed',
        token: 'test-token',
        port,
        onData: async () => ({}),
        onHealthCheck: async () => ({ status: 'green', feeds: 3 }),
      });

      await provider.start();

      const res = await originalFetch(`http://localhost:${port}/health`);
      const data = await res.json();

      expect(data.status).toBe('green');
      expect(data.feeds).toBe(3);
    });

    test('GET /data calls onData handler and returns result', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      const onData = mock(async () => ({
        price: 65432.10,
        symbol: 'BTC/USD',
        timestamp: 1700000000,
      }));

      provider = new AgtOpenProvider({
        name: 'DataProvider',
        description: 'Data test',
        type: 'price_feed',
        token: 'test-token',
        port,
        onData,
      });

      await provider.start();

      const res = await originalFetch(`http://localhost:${port}/data`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.price).toBe(65432.10);
      expect(data.symbol).toBe('BTC/USD');
      expect(data.timestamp).toBe(1700000000);
      expect(onData).toHaveBeenCalledTimes(1);
    });

    test('GET /data returns 500 if onData throws', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      provider = new AgtOpenProvider({
        name: 'ErrorProvider',
        description: 'Error test',
        type: 'price_feed',
        token: 'test-token',
        port,
        onData: async () => {
          throw new Error('Data source unavailable');
        },
      });

      await provider.start();

      const res = await originalFetch(`http://localhost:${port}/data`);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe('Data fetch failed');
    });

    test('returns 404 for unknown paths', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      provider = new AgtOpenProvider({
        name: 'NotFoundProvider',
        description: '404 test',
        type: 'price_feed',
        token: 'test-token',
        port,
        onData: async () => ({}),
      });

      await provider.start();

      const res = await originalFetch(`http://localhost:${port}/unknown`);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Not found');
    });

    test('returns 404 for POST on /data (wrong method)', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      provider = new AgtOpenProvider({
        name: 'MethodProvider',
        description: 'Method test',
        type: 'price_feed',
        token: 'test-token',
        port,
        onData: async () => ({}),
      });

      await provider.start();

      const res = await originalFetch(`http://localhost:${port}/data`, { method: 'POST' });
      expect(res.status).toBe(404);
    });

    test('onData is called each time /data is requested', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      let callCount = 0;
      const onData = mock(async () => {
        callCount++;
        return { count: callCount };
      });

      provider = new AgtOpenProvider({
        name: 'MultiCallProvider',
        description: 'Multi call test',
        type: 'price_feed',
        token: 'test-token',
        port,
        onData,
      });

      await provider.start();

      const res1 = await originalFetch(`http://localhost:${port}/data`);
      const data1 = await res1.json();
      expect(data1.count).toBe(1);

      const res2 = await originalFetch(`http://localhost:${port}/data`);
      const data2 = await res2.json();
      expect(data2.count).toBe(2);

      expect(onData).toHaveBeenCalledTimes(2);
    });
  });

  // ── stop() ──

  describe('stop()', () => {
    test('stops the server and clears heartbeat', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      provider = new AgtOpenProvider({
        name: 'StopProvider',
        description: 'Stop test',
        type: 'price_feed',
        token: 'test-token',
        port,
        onData: async () => ({}),
      });

      await provider.start();

      // Verify server is running
      const res = await originalFetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);

      await provider.stop();

      // Calling stop again should not throw
      await provider.stop();
    });
  });
});
