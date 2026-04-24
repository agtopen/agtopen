import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { AgtOpenClient, AgtOpenError } from '../client';

// Subclass to expose protected methods for testing
class TestClient extends AgtOpenClient {
  async testGet<T>(path: string): Promise<T> {
    return this.get<T>(path);
  }
  async testPost<T>(path: string, body?: unknown): Promise<T> {
    return this.post<T>(path, body);
  }
  getApiUrl(): string {
    return this.apiUrl;
  }
  getToken(): string | undefined {
    return this.token;
  }
  getDebug(): boolean {
    return this.debug;
  }
}

describe('AgtOpenClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Constructor ──

  describe('constructor', () => {
    test('sets apiUrl from config', () => {
      const client = new TestClient({ apiUrl: 'https://custom.api.com' });
      expect(client.getApiUrl()).toBe('https://custom.api.com');
    });

    test('removes trailing slash from apiUrl', () => {
      const client = new TestClient({ apiUrl: 'https://custom.api.com/' });
      expect(client.getApiUrl()).toBe('https://custom.api.com');
    });

    test('removes multiple trailing slashes from apiUrl', () => {
      const client = new TestClient({ apiUrl: 'https://custom.api.com///' });
      expect(client.getApiUrl()).toBe('https://custom.api.com');
    });

    test('uses default apiUrl when none provided', () => {
      const client = new TestClient({});
      expect(client.getApiUrl()).toBe('https://api.agtopen.com');
    });

    test('stores token from config', () => {
      const client = new TestClient({ token: 'my-jwt-token' });
      expect(client.getToken()).toBe('my-jwt-token');
    });

    test('token is undefined when not provided', () => {
      const client = new TestClient({});
      expect(client.getToken()).toBeUndefined();
    });

    test('debug defaults to false', () => {
      const client = new TestClient({});
      expect(client.getDebug()).toBe(false);
    });

    test('debug can be set to true', () => {
      const client = new TestClient({ debug: true });
      expect(client.getDebug()).toBe(true);
    });
  });

  // ── GET requests ──

  describe('get()', () => {
    test('sends GET request to correct URL', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({ ok: true }))
      );
      globalThis.fetch = mockFetch;

      const client = new TestClient({ apiUrl: 'https://api.test.com' });
      await client.testGet('/some/path');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test.com/some/path');
      expect(init.method).toBe('GET');
    });

    test('includes Content-Type header', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({}))
      );
      globalThis.fetch = mockFetch;

      const client = new TestClient({});
      await client.testGet('/test');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });

    test('parses JSON response body', async () => {
      const responseData = { users: [{ id: 1, name: 'Alice' }] };
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify(responseData))
      );

      const client = new TestClient({});
      const result = await client.testGet<{ users: { id: number; name: string }[] }>('/users');
      expect(result).toEqual(responseData);
    });

    test('does not include body in GET request', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({}))
      );
      globalThis.fetch = mockFetch;

      const client = new TestClient({});
      await client.testGet('/test');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.body).toBeUndefined();
    });
  });

  // ── POST requests ──

  describe('post()', () => {
    test('sends POST request with correct method', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({}))
      );
      globalThis.fetch = mockFetch;

      const client = new TestClient({});
      await client.testPost('/create', { name: 'test' });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('POST');
    });

    test('serializes body as JSON', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({}))
      );
      globalThis.fetch = mockFetch;

      const body = { name: 'test', value: 42 };
      const client = new TestClient({});
      await client.testPost('/create', body);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.body).toBe(JSON.stringify(body));
    });

    test('omits body when not provided', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({}))
      );
      globalThis.fetch = mockFetch;

      const client = new TestClient({});
      await client.testPost('/ping');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.body).toBeUndefined();
    });

    test('includes Content-Type header for POST', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({}))
      );
      globalThis.fetch = mockFetch;

      const client = new TestClient({});
      await client.testPost('/create', { x: 1 });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  // ── Auth header ──

  describe('authentication', () => {
    test('includes Bearer token in Authorization header when token is set', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({}))
      );
      globalThis.fetch = mockFetch;

      const client = new TestClient({ token: 'my-secret-token' });
      await client.testGet('/protected');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-secret-token');
    });

    test('does not include Authorization header when no token', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({}))
      );
      globalThis.fetch = mockFetch;

      const client = new TestClient({});
      await client.testGet('/public');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  // ── Error handling ──

  describe('error handling', () => {
    test('throws AgtOpenError on non-2xx response', async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
      );

      const client = new TestClient({});
      await expect(client.testGet('/missing')).rejects.toThrow(AgtOpenError);
    });

    test('AgtOpenError contains status code', async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
      );

      const client = new TestClient({});
      try {
        await client.testGet('/forbidden');
        throw new Error('Expected AgtOpenError');
      } catch (err) {
        expect(err).toBeInstanceOf(AgtOpenError);
        expect((err as AgtOpenError).status).toBe(403);
      }
    });

    test('AgtOpenError contains response data', async () => {
      const errorData = { error: 'Validation failed', details: ['name required'] };
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify(errorData), { status: 422 })
      );

      const client = new TestClient({});
      try {
        await client.testPost('/create', {});
        throw new Error('Expected AgtOpenError');
      } catch (err) {
        expect(err).toBeInstanceOf(AgtOpenError);
        expect((err as AgtOpenError).data).toEqual(errorData);
      }
    });

    test('AgtOpenError uses error field from response as message', async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ error: 'Custom error message' }), { status: 400 })
      );

      const client = new TestClient({});
      try {
        await client.testGet('/bad');
        throw new Error('Expected AgtOpenError');
      } catch (err) {
        expect(err).toBeInstanceOf(AgtOpenError);
        expect((err as AgtOpenError).message).toBe('Custom error message');
      }
    });

    test('AgtOpenError falls back to HTTP status when no error field', async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ something: 'else' }), { status: 500 })
      );

      const client = new TestClient({});
      try {
        await client.testGet('/fail');
        throw new Error('Expected AgtOpenError');
      } catch (err) {
        expect(err).toBeInstanceOf(AgtOpenError);
        expect((err as AgtOpenError).message).toBe('HTTP 500');
      }
    });

    test('AgtOpenError handles non-JSON response body', async () => {
      globalThis.fetch = mock(async () =>
        new Response('Internal Server Error', { status: 500 })
      );

      const client = new TestClient({});
      try {
        await client.testGet('/crash');
        throw new Error('Expected AgtOpenError');
      } catch (err) {
        expect(err).toBeInstanceOf(AgtOpenError);
        expect((err as AgtOpenError).status).toBe(500);
        // data is null because json parsing fails
        expect((err as AgtOpenError).data).toBeNull();
      }
    });
  });

  // ── AgtOpenError class ──

  describe('AgtOpenError', () => {
    test('is an instance of Error', () => {
      const err = new AgtOpenError('test', 400);
      expect(err).toBeInstanceOf(Error);
    });

    test('has correct name', () => {
      const err = new AgtOpenError('test', 400);
      expect(err.name).toBe('AgtOpenError');
    });

    test('has message, status, and data', () => {
      const data = { detail: 'something went wrong' };
      const err = new AgtOpenError('Bad Request', 400, data);
      expect(err.message).toBe('Bad Request');
      expect(err.status).toBe(400);
      expect(err.data).toEqual(data);
    });

    test('data is undefined when not provided', () => {
      const err = new AgtOpenError('Not found', 404);
      expect(err.data).toBeUndefined();
    });
  });

  // ── OTP Authentication ──

  describe('requestOtp()', () => {
    test('calls POST /auth/request-otp with email and default type', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({ success: true }))
      );
      globalThis.fetch = mockFetch;

      const client = new TestClient({});
      await client.requestOtp('user@example.com');

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.agtopen.com/auth/request-otp');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ email: 'user@example.com', type: 'login' });
    });

    test('calls with signup type when specified', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({ success: true }))
      );
      globalThis.fetch = mockFetch;

      const client = new TestClient({});
      await client.requestOtp('user@example.com', 'signup');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({ email: 'user@example.com', type: 'signup' });
    });
  });

  describe('verifyOtp()', () => {
    test('calls POST /auth/verify-otp and stores returned token', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({
          tokens: { accessToken: 'new-jwt-token-abc' }
        }))
      );
      globalThis.fetch = mockFetch;

      const client = new TestClient({});
      expect(client.getToken()).toBeUndefined();

      await client.verifyOtp('user@example.com', '123456');

      // Verify the request
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.agtopen.com/auth/verify-otp');
      expect(JSON.parse(init.body as string)).toEqual({ email: 'user@example.com', code: '123456', type: 'login' });

      // Verify the token was stored
      expect(client.getToken()).toBe('new-jwt-token-abc');
    });

    test('verifyOtp uses signup type when specified', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({
          tokens: { accessToken: 'signup-token' }
        }))
      );
      globalThis.fetch = mockFetch;

      const client = new TestClient({});
      await client.verifyOtp('user@example.com', '654321', 'signup');

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({ email: 'user@example.com', code: '654321', type: 'signup' });
    });

    test('subsequent requests use the stored token', async () => {
      let callCount = 0;
      const mockFetch = mock(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ tokens: { accessToken: 'stored-token' } }));
        }
        return new Response(JSON.stringify({ data: 'protected' }));
      });
      globalThis.fetch = mockFetch;

      const client = new TestClient({});
      await client.verifyOtp('user@example.com', '111111');
      await client.testGet('/protected');

      // Second call should have the token
      const [, init] = mockFetch.mock.calls[1] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer stored-token');
    });
  });
});
