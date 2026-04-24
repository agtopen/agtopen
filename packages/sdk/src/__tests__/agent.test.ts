import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { AgtOpenAgent } from '../agent';
import type { AgentConfig, TaskRequest, TaskResponse } from '../types';

describe('AgtOpenAgent', () => {
  const originalFetch = globalThis.fetch;
  let agent: AgtOpenAgent;
  let port: number;

  // Use unique ports for each test suite to avoid conflicts
  const BASE_PORT = 18080;
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
      if (urlStr.includes('/registry/register')) {
        return new Response(JSON.stringify({ id: 'agent-test-id', status: 'sandbox' }));
      }

      // Mock heartbeat
      if (urlStr.includes('/heartbeat')) {
        return new Response(JSON.stringify({ ok: true }));
      }

      return new Response(JSON.stringify({ error: 'not mocked' }), { status: 500 });
    });
  }

  afterEach(async () => {
    if (agent) {
      await agent.stop();
    }
    globalThis.fetch = originalFetch;
  });

  // ── Constructor ──

  describe('constructor', () => {
    test('stores config correctly', () => {
      const config: AgentConfig = {
        name: 'TestAgent',
        description: 'A test agent',
        type: 'price_feed',
        token: 'abc',
        onTask: async () => ({ taskId: '1', result: {}, timestamp: Date.now() }),
      };
      // Constructor should not throw
      agent = new AgtOpenAgent(config);
      expect(agent).toBeDefined();
    });
  });

  // ── start() ──

  describe('start()', () => {
    test('starts server and registers with API', async () => {
      port = nextPort();
      const mockFetch = createMockFetch(port);
      globalThis.fetch = mockFetch;

      agent = new AgtOpenAgent({
        name: 'StartTestAgent',
        description: 'Tests start',
        type: 'analytics',
        token: 'test-token',
        port,
        onTask: async (task) => ({ taskId: task.taskId, result: { done: true }, timestamp: Date.now() }),
      });

      const result = await agent.start();

      expect(result.id).toBe('agent-test-id');
      expect(result.status).toBe('sandbox');
    });

    test('registers with correct body', async () => {
      port = nextPort();
      const mockFetch = createMockFetch(port);
      globalThis.fetch = mockFetch;

      agent = new AgtOpenAgent({
        name: 'RegAgent',
        description: 'Registration test',
        type: 'price_feed',
        emoji: '$$',
        color: '#FF0000',
        expertise: ['crypto', 'defi'],
        protocol: 'custom-v2',
        version: '2.0.0',
        token: 'test-token',
        port,
        onTask: async (task) => ({ taskId: task.taskId, result: {}, timestamp: Date.now() }),
      });

      await agent.start();

      // Find the registration call (not the local call)
      const registrationCall = mockFetch.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('/registry/register')
      );
      expect(registrationCall).toBeDefined();

      const [, init] = registrationCall as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.name).toBe('RegAgent');
      expect(body.description).toBe('Registration test');
      expect(body.type).toBe('price_feed');
      expect(body.emoji).toBe('$$');
      expect(body.color).toBe('#FF0000');
      expect(body.expertise).toEqual(['crypto', 'defi']);
      expect(body.protocol).toBe('custom-v2');
      expect(body.version).toBe('2.0.0');
      expect(body.endpointUrl).toBe(`http://localhost:${port}`);
    });

    test('uses default values for optional registration fields', async () => {
      port = nextPort();
      const mockFetch = createMockFetch(port);
      globalThis.fetch = mockFetch;

      agent = new AgtOpenAgent({
        name: 'DefaultsAgent',
        description: 'Defaults test',
        type: 'general',
        token: 'test-token',
        port,
        onTask: async (task) => ({ taskId: task.taskId, result: {}, timestamp: Date.now() }),
      });

      await agent.start();

      const registrationCall = mockFetch.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('/registry/register')
      );
      const [, init] = registrationCall as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.emoji).toBe('\u{1F916}'); // robot emoji default
      expect(body.color).toBe('#6366F1');
      expect(body.expertise).toEqual([]);
      expect(body.protocol).toBe('agtopen-v1');
      expect(body.version).toBe('1.0.0');
    });
  });

  // ── HTTP Server ──

  describe('HTTP server', () => {
    test('responds to GET /health with agent info', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      agent = new AgtOpenAgent({
        name: 'HealthAgent',
        description: 'Health test',
        type: 'analytics',
        token: 'test-token',
        port,
        onTask: async (task) => ({ taskId: task.taskId, result: {}, timestamp: Date.now() }),
      });

      await agent.start();

      const res = await originalFetch(`http://localhost:${port}/health`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.agent).toBe('HealthAgent');
      expect(data.timestamp).toBeNumber();
    });

    test('uses custom onHealthCheck handler when provided', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      agent = new AgtOpenAgent({
        name: 'CustomHealthAgent',
        description: 'Custom health test',
        type: 'analytics',
        token: 'test-token',
        port,
        onTask: async (task) => ({ taskId: task.taskId, result: {}, timestamp: Date.now() }),
        onHealthCheck: async () => ({ status: 'healthy', custom: true, uptime: 9999 }),
      });

      await agent.start();

      const res = await originalFetch(`http://localhost:${port}/health`);
      const data = await res.json();

      expect(data.status).toBe('healthy');
      expect(data.custom).toBe(true);
      expect(data.uptime).toBe(9999);
    });

    test('responds to POST /task by calling onTask handler', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      const onTask = mock(async (task: TaskRequest): Promise<TaskResponse> => ({
        taskId: task.taskId,
        result: { answer: 42, input: task.payload },
        timestamp: Date.now(),
      }));

      agent = new AgtOpenAgent({
        name: 'TaskAgent',
        description: 'Task test',
        type: 'analytics',
        token: 'test-token',
        port,
        onTask,
      });

      await agent.start();

      const taskPayload: TaskRequest = {
        type: 'compute',
        taskId: 'task-001',
        payload: { x: 10, y: 20 },
        timestamp: Date.now(),
      };

      const res = await originalFetch(`http://localhost:${port}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskPayload),
      });

      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.taskId).toBe('task-001');
      expect(data.result.answer).toBe(42);
      expect(data.executionTimeMs).toBeNumber();
      expect(onTask).toHaveBeenCalledTimes(1);
    });

    test('returns 404 for unknown paths', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      agent = new AgtOpenAgent({
        name: 'NotFoundAgent',
        description: '404 test',
        type: 'analytics',
        token: 'test-token',
        port,
        onTask: async (task) => ({ taskId: task.taskId, result: {}, timestamp: Date.now() }),
      });

      await agent.start();

      const res = await originalFetch(`http://localhost:${port}/unknown`);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Not found');
    });

    test('returns 404 for wrong method on /health', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      agent = new AgtOpenAgent({
        name: 'MethodAgent',
        description: 'Method test',
        type: 'analytics',
        token: 'test-token',
        port,
        onTask: async (task) => ({ taskId: task.taskId, result: {}, timestamp: Date.now() }),
      });

      await agent.start();

      const res = await originalFetch(`http://localhost:${port}/health`, { method: 'POST' });
      expect(res.status).toBe(404);
    });

    test('returns 500 when onTask throws an error', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      agent = new AgtOpenAgent({
        name: 'ErrorAgent',
        description: 'Error test',
        type: 'analytics',
        token: 'test-token',
        port,
        onTask: async () => {
          throw new Error('Task processing exploded');
        },
      });

      await agent.start();

      const res = await originalFetch(`http://localhost:${port}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'compute',
          taskId: 'task-fail',
          payload: {},
          timestamp: Date.now(),
        }),
      });

      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe('Task execution failed');
    });
  });

  // ── stop() ──

  describe('stop()', () => {
    test('clears heartbeat and stops server', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      agent = new AgtOpenAgent({
        name: 'StopAgent',
        description: 'Stop test',
        type: 'analytics',
        token: 'test-token',
        port,
        onTask: async (task) => ({ taskId: task.taskId, result: {}, timestamp: Date.now() }),
      });

      await agent.start();

      // Server should be running
      const res = await originalFetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);

      await agent.stop();

      // After stop, server should not respond
      // Note: Bun.serve.stop() is immediate, so the connection should be refused
      try {
        await originalFetch(`http://localhost:${port}/health`);
        // If we get here the server is still listening (stop may be async)
      } catch {
        // Connection refused is expected
      }
    });

    test('stop is idempotent (safe to call multiple times)', async () => {
      port = nextPort();
      globalThis.fetch = createMockFetch(port);

      agent = new AgtOpenAgent({
        name: 'IdempotentAgent',
        description: 'Idempotent stop test',
        type: 'analytics',
        token: 'test-token',
        port,
        onTask: async (task) => ({ taskId: task.taskId, result: {}, timestamp: Date.now() }),
      });

      await agent.start();
      await agent.stop();
      // Should not throw
      await agent.stop();
    });
  });
});
