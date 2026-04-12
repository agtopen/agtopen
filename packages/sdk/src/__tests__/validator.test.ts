import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { AgtOpenValidator } from '../validator';
import type { ValidationTask } from '../types';

describe('AgtOpenValidator', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof mock>;
  let validator: AgtOpenValidator;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    validator = new AgtOpenValidator({
      apiUrl: 'https://api.test.com',
      token: 'test-jwt-token',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── join() ──

  describe('join()', () => {
    test('calls POST /validators/join', async () => {
      const responseBody = { id: 'val-123', status: 'active' };
      mockFetch = mock(async () =>
        new Response(JSON.stringify(responseBody))
      );
      globalThis.fetch = mockFetch;

      const result = await validator.join();

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.com/validators/join');
      expect(init.method).toBe('POST');
      expect(result).toEqual(responseBody);
    });

    test('includes authorization header', async () => {
      mockFetch = mock(async () =>
        new Response(JSON.stringify({ id: 'val-1', status: 'active' }))
      );
      globalThis.fetch = mockFetch;

      await validator.join();

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-jwt-token');
    });

    test('throws on server error', async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ error: 'Already joined' }), { status: 409 })
      );

      await expect(validator.join()).rejects.toThrow('Already joined');
    });
  });

  // ── getProfile() ──

  describe('getProfile()', () => {
    test('calls GET /validators/me and returns validator object', async () => {
      const validatorProfile = {
        id: 'val-123',
        xp: 1500,
        accuracy: 0.92,
        tasksCompleted: 45,
      };
      mockFetch = mock(async () =>
        new Response(JSON.stringify({ validator: validatorProfile }))
      );
      globalThis.fetch = mockFetch;

      const result = await validator.getProfile();

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.com/validators/me');
      expect(init.method).toBe('GET');
      expect(result).toEqual(validatorProfile);
    });

    test('extracts validator from response wrapper', async () => {
      const inner = { id: 'v-1', rank: 5 };
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ validator: inner, meta: 'ignored' }))
      );

      const result = await validator.getProfile();
      expect(result).toEqual(inner);
    });
  });

  // ── getTasks() ──

  describe('getTasks()', () => {
    const sampleTasks: ValidationTask[] = [
      {
        id: 'task-1',
        type: 'binary',
        title: 'Price accuracy check',
        description: 'Is BTC price above 60k?',
        options: ['Yes', 'No'],
        difficulty: 1,
        xpReward: 10,
        expiresAt: '2025-12-31T23:59:59Z',
      },
      {
        id: 'task-2',
        type: 'multi',
        title: 'Sentiment check',
        description: 'What is the overall sentiment?',
        options: ['Bullish', 'Bearish', 'Neutral'],
        difficulty: 2,
        xpReward: 25,
        expiresAt: '2025-12-31T23:59:59Z',
      },
    ];

    test('calls GET /validators/tasks with default limit', async () => {
      mockFetch = mock(async () =>
        new Response(JSON.stringify({ tasks: sampleTasks }))
      );
      globalThis.fetch = mockFetch;

      const result = await validator.getTasks();

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.com/validators/tasks?limit=20');
      expect(result).toEqual(sampleTasks);
    });

    test('uses custom limit parameter', async () => {
      mockFetch = mock(async () =>
        new Response(JSON.stringify({ tasks: [] }))
      );
      globalThis.fetch = mockFetch;

      await validator.getTasks(5);

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.com/validators/tasks?limit=5');
    });

    test('returns empty array when no tasks available', async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ tasks: [] }))
      );

      const result = await validator.getTasks();
      expect(result).toEqual([]);
    });

    test('extracts tasks array from response wrapper', async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ tasks: sampleTasks, total: 100 }))
      );

      const result = await validator.getTasks();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('task-1');
    });
  });

  // ── getTask() ──

  describe('getTask()', () => {
    test('calls GET /validators/tasks/:id', async () => {
      const taskDetail = {
        id: 'task-abc',
        type: 'binary',
        title: 'Check output',
        votes: 15,
      };
      mockFetch = mock(async () =>
        new Response(JSON.stringify(taskDetail))
      );
      globalThis.fetch = mockFetch;

      const result = await validator.getTask('task-abc');

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.com/validators/tasks/task-abc');
      expect(init.method).toBe('GET');
      expect(result).toEqual(taskDetail);
    });

    test('throws on 404 for unknown task', async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ error: 'Task not found' }), { status: 404 })
      );

      await expect(validator.getTask('nonexistent')).rejects.toThrow('Task not found');
    });
  });

  // ── vote() ──

  describe('vote()', () => {
    test('calls POST /validators/tasks/:id/vote with answer and confidence', async () => {
      const voteResponse = { voteId: 'vote-xyz' };
      mockFetch = mock(async () =>
        new Response(JSON.stringify(voteResponse))
      );
      globalThis.fetch = mockFetch;

      const result = await validator.vote('task-1', 'Yes', 0.9);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.com/validators/tasks/task-1/vote');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ answer: 'Yes', confidence: 0.9 });
      expect(result).toEqual(voteResponse);
    });

    test('uses default confidence of 0.5 when not specified', async () => {
      mockFetch = mock(async () =>
        new Response(JSON.stringify({ voteId: 'vote-1' }))
      );
      globalThis.fetch = mockFetch;

      await validator.vote('task-2', 'No');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({ answer: 'No', confidence: 0.5 });
    });

    test('handles full confidence (1.0)', async () => {
      mockFetch = mock(async () =>
        new Response(JSON.stringify({ voteId: 'vote-2' }))
      );
      globalThis.fetch = mockFetch;

      await validator.vote('task-3', 'Bullish', 1.0);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({ answer: 'Bullish', confidence: 1.0 });
    });

    test('throws on duplicate vote', async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ error: 'Already voted' }), { status: 409 })
      );

      await expect(validator.vote('task-1', 'Yes', 0.8)).rejects.toThrow('Already voted');
    });
  });

  // ── getLeaderboard() ──

  describe('getLeaderboard()', () => {
    test('calls GET /validators/leaderboard with default limit', async () => {
      const validators = [
        { id: 'v-1', xp: 5000, rank: 1 },
        { id: 'v-2', xp: 4200, rank: 2 },
      ];
      mockFetch = mock(async () =>
        new Response(JSON.stringify({ validators }))
      );
      globalThis.fetch = mockFetch;

      const result = await validator.getLeaderboard();

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.com/validators/leaderboard?limit=50');
      expect(init.method).toBe('GET');
      expect(result).toEqual(validators);
    });

    test('uses custom limit parameter', async () => {
      mockFetch = mock(async () =>
        new Response(JSON.stringify({ validators: [] }))
      );
      globalThis.fetch = mockFetch;

      await validator.getLeaderboard(10);

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.com/validators/leaderboard?limit=10');
    });

    test('returns empty array when no validators', async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ validators: [] }))
      );

      const result = await validator.getLeaderboard();
      expect(result).toEqual([]);
    });

    test('extracts validators from response wrapper', async () => {
      const validators = [{ id: 'v-1', xp: 100 }];
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ validators, page: 1, totalPages: 5 }))
      );

      const result = await validator.getLeaderboard();
      expect(result).toEqual(validators);
    });
  });
});
