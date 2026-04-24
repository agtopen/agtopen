import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { AgtOpenTool } from '../tool';
import type { ToolConfig } from '../types';

describe('AgtOpenTool', () => {
  const originalFetch = globalThis.fetch;
  let tool: AgtOpenTool;
  let port: number;

  const BASE_PORT = 18300;
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
      if (urlStr.includes('/tools/register')) {
        return new Response(JSON.stringify({ id: 'tool-test-id', status: 'sandbox' }));
      }

      // Mock heartbeat
      if (urlStr.includes('/heartbeat')) {
        return new Response(JSON.stringify({ ok: true }));
      }

      return new Response(JSON.stringify({ error: 'not mocked' }), { status: 500 });
    });
  }

  afterEach(async () => {
    if (tool) {
      await tool.stop();
    }
    globalThis.fetch = originalFetch;
  });

  // ── start() ──

  describe('start()', () => {
    test('starts server and registers with API', async () => {
      port = nextPort();
      const mockFetch = createMockFetch(port);
      globalThis.fetch = mockFetch;

      tool = new AgtOpenTool({
        name: 'TestTool',
        description: 'A test tool',
        type: 'calculator',
        inputSchema: { a: 'number', b: 'number' },
        outputSchema: { sum: 'number' },
        token: 'test-token',
        port,
        onExecute: async (input) => ({ sum: (input.a as number) + (input.b as number) }),
      });

      const result = await tool.start();

      expect(result.id).toBe('tool-test-id');
      expect(result.status).toBe('sandbox');
    });

    test('registers with correct body', async () => {
      port = nextPort();
      const mockFetch = createMockFetch(port);
      globalThis.fetch = mockFetch;

      tool = new AgtOpenTool({
        name: 'GasCalc',
        description: 'Calculate gas costs',
        type: 'calculator',
        emoji: '&',
        tags: ['ethereum', 'gas'],
        version: '2.1.0',
        inputSchema: { gasLimit: 'number' },
        outputSchema: { costEth: 'number' },
        token: 'test-token',
        port,
        onExecute: async (input) => ({ costEth: 0.01 }),
      });

      await tool.start();

      const registrationCall = mockFetch.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('/tools/register')
      );
      expect(registrationCall).toBeDefined();

      const [, init] = registrationCall as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.name).toBe('GasCalc');
      expect(body.description).toBe('Calculate gas costs');
      expect(body.type).toBe('calculator');
      expect(body.emoji).toBe('&');
      expect(body.tags).toEqual(['ethereum', 'gas']);
      expect(body.version).toBe('2.1.0');
      expect(body.endpointUrl).toBe(`http://localhost:${port}`);
      expect(body.exampleInput).toEqual({});
    });

    test('uses default values for optional fields', async () => {
      port = nextPort();
      const mockFetch = createMockFetch(port);
      globalThis.fetch = mockFetch;

      tool = new AgtOpenTool({
        name: 'DefaultTool',
        description: 'Defaults test',
        type: 'custom',
        inputSchema: {},
        outputSchema: {},
        token: 'test-token',
        port,
        onExecute: async () => ({}),
      });

      await tool.start();

      const registrationCall = mockFetch.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('/tools/register')
      );
      const [, init] = registrationCall as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.emoji).toBe('\u{1F527}'); // wrench emoji
      expect(body.tags).toEqual([]);
      expect(body.version).toBe('1.0.0');
    });
  });

  // ── HTTP Server ──

  describe('HTTP server', () => {
    test('GET /health returns health info', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      tool = new AgtOpenTool({
        name: 'HealthTool',
        description: 'Health test',
        type: 'calculator',
        inputSchema: {},
        outputSchema: {},
        token: 'test-token',
        port,
        onExecute: async () => ({}),
      });

      await tool.start();

      const res = await originalFetch(`http://localhost:${port}/health`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.tool).toBe('HealthTool');
      expect(data.timestamp).toBeNumber();
    });

    test('GET /health uses custom onHealthCheck when provided', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      tool = new AgtOpenTool({
        name: 'CustomHealthTool',
        description: 'Custom health',
        type: 'calculator',
        inputSchema: {},
        outputSchema: {},
        token: 'test-token',
        port,
        onExecute: async () => ({}),
        onHealthCheck: async () => ({ status: 'ready', version: '3.0' }),
      });

      await tool.start();

      const res = await originalFetch(`http://localhost:${port}/health`);
      const data = await res.json();

      expect(data.status).toBe('ready');
      expect(data.version).toBe('3.0');
    });

    test('GET /schema returns tool schema with input and output', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      const inputSchema = { gasLimit: 'number', gasPriceGwei: 'number' };
      const outputSchema = { costEth: 'number', costUsd: 'number' };

      tool = new AgtOpenTool({
        name: 'SchemaTestTool',
        description: 'Schema test tool',
        type: 'calculator',
        inputSchema,
        outputSchema,
        token: 'test-token',
        port,
        onExecute: async () => ({}),
      });

      await tool.start();

      const res = await originalFetch(`http://localhost:${port}/schema`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.name).toBe('SchemaTestTool');
      expect(data.description).toBe('Schema test tool');
      expect(data.input).toEqual(inputSchema);
      expect(data.output).toEqual(outputSchema);
    });

    test('POST /execute calls onExecute with input and returns output', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      const onExecute = mock(async (input: Record<string, unknown>) => ({
        sum: (input.a as number) + (input.b as number),
      }));

      tool = new AgtOpenTool({
        name: 'ExecTool',
        description: 'Execute test',
        type: 'calculator',
        inputSchema: { a: 'number', b: 'number' },
        outputSchema: { sum: 'number' },
        token: 'test-token',
        port,
        onExecute,
      });

      await tool.start();

      const res = await originalFetch(`http://localhost:${port}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { a: 3, b: 7 } }),
      });

      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.output).toEqual({ sum: 10 });
      expect(onExecute).toHaveBeenCalledTimes(1);
    });

    test('POST /execute handles body without input wrapper', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      const onExecute = mock(async (input: Record<string, unknown>) => ({
        doubled: (input.value as number) * 2,
      }));

      tool = new AgtOpenTool({
        name: 'UnwrappedTool',
        description: 'Unwrapped input test',
        type: 'transformer',
        inputSchema: { value: 'number' },
        outputSchema: { doubled: 'number' },
        token: 'test-token',
        port,
        onExecute,
      });

      await tool.start();

      // Send body directly without { input: ... } wrapper
      const res = await originalFetch(`http://localhost:${port}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 5 }),
      });

      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.output).toEqual({ doubled: 10 });
    });

    test('POST /execute returns 500 if onExecute throws', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      tool = new AgtOpenTool({
        name: 'ErrorTool',
        description: 'Error test',
        type: 'calculator',
        inputSchema: {},
        outputSchema: {},
        token: 'test-token',
        port,
        onExecute: async () => {
          throw new Error('Division by zero');
        },
      });

      await tool.start();

      const res = await originalFetch(`http://localhost:${port}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      });

      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe('Execution failed');
    });

    test('returns 404 for unknown paths', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      tool = new AgtOpenTool({
        name: 'NotFoundTool',
        description: '404 test',
        type: 'calculator',
        inputSchema: {},
        outputSchema: {},
        token: 'test-token',
        port,
        onExecute: async () => ({}),
      });

      await tool.start();

      const res = await originalFetch(`http://localhost:${port}/missing`);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Not found');
    });

    test('returns 404 for GET on /execute (wrong method)', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      tool = new AgtOpenTool({
        name: 'MethodTool',
        description: 'Method test',
        type: 'calculator',
        inputSchema: {},
        outputSchema: {},
        token: 'test-token',
        port,
        onExecute: async () => ({}),
      });

      await tool.start();

      const res = await originalFetch(`http://localhost:${port}/execute`);
      expect(res.status).toBe(404);
    });
  });

  // ── stop() ──

  describe('stop()', () => {
    test('stops the server and clears heartbeat', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      tool = new AgtOpenTool({
        name: 'StopTool',
        description: 'Stop test',
        type: 'calculator',
        inputSchema: {},
        outputSchema: {},
        token: 'test-token',
        port,
        onExecute: async () => ({}),
      });

      await tool.start();

      // Verify server is running
      const res = await originalFetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);

      await tool.stop();

      // Calling stop again should not throw
      await tool.stop();
    });
  });
});
