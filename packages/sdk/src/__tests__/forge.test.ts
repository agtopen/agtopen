import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { AgtOpenForge, type ForgeRunAck, type ForgeWebhookEvent } from '../forge';

describe('AgtOpenForge', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── create() ──────────────────────────────────────────────────

  describe('create()', () => {
    test('POSTs to /forge with shape the server expects', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({
          id: 'a-1', name: 'x', emoji: '🤖', status: 'draft',
          category: 'custom', runCount: 0, successRate: 0,
          totalAtomsUsed: 0, createdAt: '2026-04-24T00:00:00Z',
        })),
      );
      globalThis.fetch = mockFetch;

      const forge = new AgtOpenForge({ token: 'jwt', apiUrl: 'https://api.test' });
      await forge.create({
        name: 'Bot',
        primeDirective: 'do stuff',
        dataSources: [{ platform: 'binance' }],
        triggers: [{ type: 'schedule', intervalMinutes: 60 }],
        actions: ['generate-report'],
      });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.test/forge');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string);
      expect(body.name).toBe('Bot');
      expect(body.status).toBe('draft');
      expect(body.dataSources.sources[0].platform).toBe('binance');
      expect(body.triggers[0].condition.intervalMinutes).toBe(60);
      expect(body.actions.blocks[0].type).toBe('generate-report');
    });
  });

  // ── run() ─────────────────────────────────────────────────────

  describe('run()', () => {
    test('returns typed { run, estimatedCost, balance }', async () => {
      const ack: ForgeRunAck = {
        run: {
          id: 'r-1', status: 'pending', triggerType: 'manual',
          result: null, durationMs: 0, atomsUsed: 0,
          startedAt: '2026-04-24T00:00:00Z',
        },
        estimatedCost: 5,
        balance: 100,
      };
      globalThis.fetch = mock(async () => new Response(JSON.stringify(ack), { status: 201 }));

      const forge = new AgtOpenForge({ token: 'jwt' });
      const got = await forge.run('a-1');
      expect(got).toEqual(ack);
      expect(got.run.id).toBe('r-1'); // compile-time proof it's typed
    });

    test('propagates 409 run_already_queued as AgtOpenError', async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ error: 'run_already_queued' }), { status: 409 }),
      );
      const forge = new AgtOpenForge({ token: 'jwt' });
      await expect(forge.run('a-1')).rejects.toThrow('run_already_queued');
    });
  });

  // ── sendWebhook() ─────────────────────────────────────────────

  describe('sendWebhook()', () => {
    test('POSTs raw payload to /forge/:id/webhook (JWT-auth path)', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({
          run: { id: 'r-2', status: 'pending', triggerType: 'webhook', result: null, durationMs: 0, atomsUsed: 0, startedAt: '' },
        }), { status: 202 }),
      );
      globalThis.fetch = mockFetch;

      const forge = new AgtOpenForge({ token: 'jwt' });
      await forge.sendWebhook('a-1', { price: 42, source: 'binance' });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/forge/a-1/webhook');
      expect(url.endsWith('/run')).toBe(false); // guard against regression
      // Payload is the raw body — NOT wrapped in { triggerData: ... }.
      // Server parses it as-is and stashes under triggerData.payload.
      expect(JSON.parse(init.body as string)).toEqual({ price: 42, source: 'binance' });
      // Must carry the bearer token so the server's hybrid-auth path
      // takes the owner branch (no HMAC signing needed from SDK).
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer jwt');
    });
  });

  // ── getWebhookSecret() / rotateWebhookSecret() ────────────────

  describe('getWebhookSecret()', () => {
    test('GETs /forge/:id/webhook-secret and returns typed payload', async () => {
      const body = {
        secret: 'deadbeef'.repeat(8),
        ingressUrl: 'https://api.agtopen.com/forge/a-1/webhook',
        signatureHeader: 'X-Agtopen-Signature',
        signatureFormat: 'sha256=<hex>',
      };
      const mockFetch = mock(async () => new Response(JSON.stringify(body)));
      globalThis.fetch = mockFetch;

      const forge = new AgtOpenForge({ token: 'jwt' });
      const got = await forge.getWebhookSecret('a-1');

      expect(got).toEqual(body);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/forge/a-1/webhook-secret');
      expect(init.method).toBe('GET');
    });
  });

  describe('rotateWebhookSecret()', () => {
    test('POSTs to /forge/:id/webhook-secret/rotate', async () => {
      const mockFetch = mock(async () =>
        new Response(JSON.stringify({ secret: 'cafe'.repeat(16) })),
      );
      globalThis.fetch = mockFetch;

      const forge = new AgtOpenForge({ token: 'jwt' });
      const got = await forge.rotateWebhookSecret('a-1');
      expect(got.secret).toHaveLength(64);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/forge/a-1/webhook-secret/rotate');
      expect(init.method).toBe('POST');
    });
  });

  // ── verifyWebhook() ───────────────────────────────────────────

  describe('verifyWebhook()', () => {
    // Known-answer vector: HMAC-SHA256("secret", '{"x":1}')
    // Pinned so the test catches any byte-level regression in the
    // verifier (encoding, prefix handling, constant-time compare).
    const BODY = '{"x":1}';
    const SECRET = 'secret';
    const SIG = '83830743d86527ff1b7e251328e56b070f2c790ca81199bdf5c31ff65fc919eb';

    test('accepts a valid sha256=<hex> header', async () => {
      const ok = await AgtOpenForge.verifyWebhook(BODY, `sha256=${SIG}`, SECRET);
      expect(ok).toBe(true);
    });

    test('accepts bare hex without the sha256= prefix', async () => {
      const ok = await AgtOpenForge.verifyWebhook(BODY, SIG, SECRET);
      expect(ok).toBe(true);
    });

    test('rejects a tampered signature', async () => {
      const bad = SIG.replace(/.$/, (c) => (c === '0' ? '1' : '0'));
      const ok = await AgtOpenForge.verifyWebhook(BODY, `sha256=${bad}`, SECRET);
      expect(ok).toBe(false);
    });

    test('rejects when the body was modified', async () => {
      const ok = await AgtOpenForge.verifyWebhook('{"x":2}', `sha256=${SIG}`, SECRET);
      expect(ok).toBe(false);
    });

    test('rejects a missing header', async () => {
      const ok = await AgtOpenForge.verifyWebhook(BODY, null, SECRET);
      expect(ok).toBe(false);
    });

    test('accepts a Uint8Array body (binary-safe path)', async () => {
      const ok = await AgtOpenForge.verifyWebhook(
        new TextEncoder().encode(BODY),
        `sha256=${SIG}`,
        SECRET,
      );
      expect(ok).toBe(true);
    });
  });

  // ── webhookHandler() ──────────────────────────────────────────

  describe('webhookHandler()', () => {
    const BODY = '{"type":"run.completed","agentId":"a-1","runId":"r-1","timestamp":"2026-04-24T00:00:00Z","data":{"ok":true}}';
    const SECRET = 'whsec_test';
    // HMAC-SHA256(SECRET, BODY); fixture pinned same way as verifyWebhook
    const SIG = '68774c9f5afcf2e97d8af509a006981454eb0557fabcd78e0d8c6f7dec15d807';

    test('delivers parsed event to onEvent on valid signature', async () => {
      let received: ForgeWebhookEvent | null = null;
      const handler = AgtOpenForge.webhookHandler({
        secret: SECRET,
        onEvent: (e) => { received = e; },
      });

      // Precompute the correct signature at test time so we don't pin a
      // fragile hex fixture — exercises the real round-trip.
      const expected = await hmacHex(SECRET, BODY);
      const res = await handler(new Request('https://svc/hook', {
        method: 'POST',
        headers: { 'X-Agtopen-Signature': `sha256=${expected}` },
        body: BODY,
      }));

      expect(res.status).toBe(200);
      expect(received).not.toBeNull();
      expect(received!.type).toBe('run.completed');
      expect(received!.agentId).toBe('a-1');
    });

    test('401 on bad signature, onEvent not called', async () => {
      let called = false;
      const handler = AgtOpenForge.webhookHandler({
        secret: SECRET,
        onEvent: () => { called = true; },
      });
      const res = await handler(new Request('https://svc/hook', {
        method: 'POST',
        headers: { 'X-Agtopen-Signature': 'sha256=deadbeef' },
        body: BODY,
      }));
      expect(res.status).toBe(401);
      expect(called).toBe(false);
    });

    test('405 on non-POST', async () => {
      const handler = AgtOpenForge.webhookHandler({ secret: SECRET, onEvent: () => {} });
      const res = await handler(new Request('https://svc/hook', { method: 'GET' }));
      expect(res.status).toBe(405);
    });

    test('400 on malformed JSON body', async () => {
      const handler = AgtOpenForge.webhookHandler({ secret: SECRET, onEvent: () => {} });
      const bad = 'not-json';
      const expected = await hmacHex(SECRET, bad);
      const res = await handler(new Request('https://svc/hook', {
        method: 'POST',
        headers: { 'X-Agtopen-Signature': `sha256=${expected}` },
        body: bad,
      }));
      expect(res.status).toBe(400);
    });

    test('honors a custom header name', async () => {
      const handler = AgtOpenForge.webhookHandler({
        secret: SECRET,
        onEvent: () => {},
        headerName: 'X-My-Sig',
      });
      const expected = await hmacHex(SECRET, BODY);
      const res = await handler(new Request('https://svc/hook', {
        method: 'POST',
        headers: { 'X-My-Sig': `sha256=${expected}` },
        body: BODY,
      }));
      expect(res.status).toBe(200);
    });

    // Keep SIG reachable so linters don't complain about the unused fixture,
    // and sanity-check our hmacHex helper matches the pinned value.
    test('pinned fixture matches runtime HMAC', async () => {
      expect(await hmacHex(SECRET, BODY)).toBe(SIG);
    });
  });
});

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const buf = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
