import { AgtOpenClient } from './client.js';

/**
 * AgtOpen Forge — Create and manage agents programmatically.
 *
 * For developers who want full control over agent configuration,
 * deployment, and monitoring without the UI wizard.
 *
 * @example
 * ```ts
 * import { AgtOpenForge } from '@agtopen/sdk/forge'
 *
 * const forge = new AgtOpenForge({ token: 'your-jwt' })
 *
 * // Create agent
 * const agent = await forge.create({
 *   name: 'My Trading Bot',
 *   category: 'finance',
 *   primeDirective: 'Monitor BTC price...',
 *   dataSources: [{ platform: 'binance', weight: 100 }],
 *   triggers: [{ type: 'schedule', intervalMinutes: 60 }],
 *   actions: ['generate-report', 'push-notification'],
 * })
 *
 * // Deploy + start
 * await forge.deploy(agent.id)
 * await forge.start(agent.id)
 *
 * // Monitor
 * const runs = await forge.getRuns(agent.id)
 * const stats = await forge.getStats(agent.id)
 *
 * // Publish as template
 * await forge.publishTemplate(agent.id)
 * ```
 */
export class AgtOpenForge extends AgtOpenClient {

  /** Create a new agent with full configuration */
  async create(config: ForgeCreateConfig): Promise<ForgeAgent> {
    return this.post<ForgeAgent>('/forge', {
      name: config.name,
      emoji: config.emoji || '🤖',
      description: config.description || '',
      category: config.category || 'custom',
      primeDirective: config.primeDirective,
      dataSources: {
        sources: (config.dataSources || []).map((ds, i) => ({
          id: ds.id || `src-${i}`,
          name: ds.name || ds.platform,
          platform: ds.platform,
          config: ds.config || {},
          weight: ds.weight || 50,
          color: ds.color || '#6366F1',
          enabled: true,
        })),
      },
      triggers: (config.triggers || []).map((t, i) => ({
        id: t.id || `t-${i}`,
        type: t.type,
        label: t.label || t.type,
        enabled: true,
        condition: {
          ...(t.intervalMinutes ? { intervalMinutes: t.intervalMinutes } : {}),
          ...(t.cron ? { cron: t.cron } : {}),
          ...(t.url ? { url: t.url, jsonPath: t.jsonPath, operator: t.operator || 'gt', value: t.value } : {}),
        },
      })),
      actions: {
        blocks: (config.actions || ['generate-report']).map((a, i) => {
          const type = typeof a === 'string' ? a : a.type;
          const actionConfig = typeof a === 'string' ? {} : a.config || {};
          return {
            id: `a-${i}`,
            type,
            label: type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            category: 'automation',
            config: actionConfig,
            position: i,
          };
        }),
      },
      riskTolerance: config.personality?.speed ?? 0.5,
      creativity: config.personality?.creativity ?? 0.5,
      maxDrawdown: config.personality?.caution ?? 0.1,
      energyMode: config.energyMode || 'eco',
      currentStep: 6,
      status: 'draft',
    });
  }

  /** Deploy agent (draft → active) */
  async deploy(agentId: string): Promise<void> {
    await this.post(`/forge/${agentId}/deploy`);
  }

  /** Start agent scheduling */
  async start(agentId: string): Promise<void> {
    await this.post(`/forge/${agentId}/start`);
  }

  /** Stop agent */
  async stop(agentId: string): Promise<void> {
    await this.post(`/forge/${agentId}/stop`);
  }

  /** Pause agent (preserves schedule) */
  async pause(agentId: string): Promise<void> {
    await this.post(`/forge/${agentId}/pause`);
  }

  /**
   * Trigger a manual run. Returns the queued `ForgeRun` plus the atoms
   * pre-flight (`estimatedCost` vs. `balance`) that the server computed
   * before inserting. Rejects with 402 if the balance is too low, 409 if
   * a manual run is already pending for this agent.
   */
  async run(agentId: string): Promise<ForgeRunAck> {
    return this.post<ForgeRunAck>(`/forge/${agentId}/run`);
  }

  /** Create + deploy + start in one call. Returns the created agent. */
  async createAndDeploy(config: ForgeCreateConfig): Promise<ForgeAgent> {
    const agent = await this.create(config);
    await this.deploy(agent.id);
    await this.start(agent.id);
    await this.run(agent.id); // First run
    return agent;
  }

  /**
   * Feed an external webhook payload into a webhook-triggered agent.
   * Hits the public `POST /forge/:id/webhook` ingress with this
   * client's JWT as the auth proof, so no HMAC signing is needed on
   * this path. The server inserts a pending `triggerType: 'webhook'`
   * run whose `triggerData.payload` is your object. Server returns
   * HTTP 202 with the queued run.
   *
   * For the third-party inbound direction (GitHub, Stripe, etc. POST-ing
   * to YOU via an agent's `call-webhook` action), use
   * `AgtOpenForge.verifyWebhook` / `webhookHandler`.
   */
  async sendWebhook(agentId: string, payload: unknown): Promise<{ run: ForgeRun }> {
    return this.post<{ run: ForgeRun }>(`/forge/${agentId}/webhook`, payload);
  }

  /**
   * Return the per-agent HMAC secret + the public ingress URL you'd
   * paste into GitHub / Stripe / Zapier. Owner-only. The secret is
   * ALSO the key Forge uses to sign outbound `call-webhook` actions,
   * so it's what you pass to `verifyWebhook` / `webhookHandler` on
   * the receiving server.
   */
  async getWebhookSecret(agentId: string): Promise<ForgeWebhookSecret> {
    return this.get<ForgeWebhookSecret>(`/forge/${agentId}/webhook-secret`);
  }

  /**
   * Rotate the agent's webhook secret. The old secret stops working
   * immediately — any external service still configured with it will
   * 401 on its next call. Intended for the "I think this leaked"
   * scenario.
   */
  async rotateWebhookSecret(agentId: string): Promise<{ secret: string }> {
    return this.post<{ secret: string }>(`/forge/${agentId}/webhook-secret/rotate`);
  }

  /**
   * Verify an HMAC-SHA256 signature on a webhook body that Forge
   * delivered to your server via a `call-webhook` action. The signature
   * header is `X-Agtopen-Signature: sha256=<hex>` and is computed over
   * the raw request body with the shared secret.
   *
   * Uses `globalThis.crypto.subtle`, so it runs on Node 20+, Bun, Deno,
   * Cloudflare Workers, and any other Web-Crypto-compatible runtime —
   * no `node:crypto` import, no `Buffer`.
   */
  static async verifyWebhook(
    rawBody: string | Uint8Array,
    signatureHeader: string | null | undefined,
    secret: string,
  ): Promise<boolean> {
    if (!signatureHeader) return false;
    const expected = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice('sha256='.length)
      : signatureHeader;
    const encoder = new TextEncoder();
    const bodyBytes = typeof rawBody === 'string' ? encoder.encode(rawBody) : rawBody;
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    // Copy into a fresh Uint8Array<ArrayBuffer> so WebCrypto's BufferSource
    // type accepts it across Node/Bun/Deno/Workers (TS narrows the generic
    // Uint8Array to ArrayBufferLike, which subtle.sign rejects).
    const signInput = new Uint8Array(bodyBytes.byteLength);
    signInput.set(bodyBytes);
    const sigBuf = await globalThis.crypto.subtle.sign('HMAC', key, signInput);
    const actual = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return timingSafeEqualHex(actual, expected);
  }

  /**
   * Build a Fetch-API-compatible webhook handler: `(Request) => Response`.
   * Plugs into Node (via `createServer` + web-streams), Bun, Deno, and
   * Cloudflare Workers without adapter code. The handler verifies the
   * `X-Agtopen-Signature` header against `secret` and passes the parsed
   * JSON payload to `onEvent`.
   */
  static webhookHandler(opts: {
    secret: string;
    onEvent: (event: ForgeWebhookEvent) => void | Promise<void>;
    /** Override the signature header name (default `X-Agtopen-Signature`). */
    headerName?: string;
  }): (req: Request) => Promise<Response> {
    const headerName = opts.headerName ?? 'X-Agtopen-Signature';
    return async (req: Request): Promise<Response> => {
      if (req.method !== 'POST') {
        return new Response('method not allowed', { status: 405 });
      }
      const raw = await req.text();
      const ok = await AgtOpenForge.verifyWebhook(
        raw,
        req.headers.get(headerName),
        opts.secret,
      );
      if (!ok) return new Response('invalid signature', { status: 401 });
      let event: ForgeWebhookEvent;
      try {
        event = JSON.parse(raw) as ForgeWebhookEvent;
      } catch {
        return new Response('invalid json', { status: 400 });
      }
      await opts.onEvent(event);
      return new Response('ok', { status: 200 });
    };
  }

  /** Get agent details */
  async getAgent(agentId: string): Promise<ForgeAgent> {
    return this.get<{ agent: ForgeAgent }>(`/forge/${agentId}`).then(r => r.agent);
  }

  /** List all user's agents */
  async listAgents(page = 1, limit = 20): Promise<{ agents: ForgeAgent[]; total: number }> {
    return this.get(`/forge?page=${page}&limit=${limit}`);
  }

  /** Get agent runs */
  async getRuns(agentId: string, limit = 10): Promise<ForgeRun[]> {
    return this.get<{ runs: ForgeRun[] }>(`/forge/${agentId}/runs?limit=${limit}`).then(r => r.runs);
  }

  /** Get agent stats */
  async getStats(agentId: string): Promise<ForgeStats> {
    return this.get<{ stats: ForgeStats }>(`/forge/${agentId}/stats`).then(r => r.stats);
  }

  /** Get agent logs */
  async getLogs(agentId: string, level?: string, limit = 50): Promise<ForgeLog[]> {
    const q = level ? `&level=${level}` : '';
    return this.get<{ logs: ForgeLog[] }>(`/forge/${agentId}/logs?limit=${limit}${q}`).then(r => r.logs);
  }

  /** Publish agent as marketplace template */
  async publishTemplate(agentId: string): Promise<{ templateId: string }> {
    const res = await this.post<{ template: { id: string } }>(`/forge/templates/publish/${agentId}`);
    return { templateId: res.template.id };
  }

  /** Fork a marketplace template into a new agent */
  async forkTemplate(templateId: string): Promise<ForgeAgent> {
    return this.post<{ agent: ForgeAgent }>(`/forge/templates/${templateId}/fork`).then(r => r.agent);
  }

  /** Browse marketplace templates */
  async browseTemplates(opts?: { category?: string; sort?: string; page?: number }): Promise<{ templates: any[]; total: number }> {
    const params = new URLSearchParams();
    if (opts?.category) params.set('category', opts.category);
    if (opts?.sort) params.set('sort', opts.sort);
    if (opts?.page) params.set('page', String(opts.page));
    return this.get(`/forge/templates?${params}`);
  }

  /** Get atoms balance */
  async getBalance(): Promise<{ balance: number }> {
    return this.get('/economy/balance');
  }

  /** Buy intelligence from the market */
  async buyIntelligence(type: string, agentId?: string): Promise<{ data: any; atomsSpent: number }> {
    return this.post('/intelligence/purchase', { intelligenceId: type, agentId });
  }
}

// ── Types ──

export interface ForgeCreateConfig {
  name: string;
  emoji?: string;
  description?: string;
  category?: 'finance' | 'monitoring' | 'research' | 'communication' | 'content' | 'business' | 'ecommerce' | 'developer' | 'personal' | 'custom';
  primeDirective: string;
  dataSources?: Array<{
    id?: string;
    name?: string;
    platform: string;
    config?: Record<string, unknown>;
    weight?: number;
    color?: string;
  }>;
  triggers?: Array<{
    id?: string;
    type: 'schedule' | 'threshold' | 'webhook' | 'manual';
    label?: string;
    intervalMinutes?: number;
    cron?: string;
    url?: string;
    jsonPath?: string;
    operator?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
    value?: number;
  }>;
  actions?: Array<string | { type: string; config?: Record<string, unknown> }>;
  personality?: { speed?: number; creativity?: number; caution?: number };
  energyMode?: 'eco' | 'hyper';
}

export interface ForgeAgent {
  id: string;
  name: string;
  emoji: string;
  status: string;
  category: string;
  runCount: number;
  successRate: number;
  totalAtomsUsed: number;
  createdAt: string;
}

export interface ForgeRun {
  id: string;
  status: string;
  triggerType: string;
  result: unknown;
  durationMs: number;
  atomsUsed: number;
  startedAt: string;
}

export interface ForgeStats {
  totalRuns: number;
  successCount: number;
  failedCount: number;
  successRate: number;
  avgDurationMs: number;
  totalAtomsUsed: number;
  runsLast24h: number;
}

export interface ForgeLog {
  id: string;
  level: string;
  phase: string;
  message: string;
  createdAt: string;
}

/** Response from `POST /forge/:id/run` — pending run plus atoms pre-flight. */
export interface ForgeRunAck {
  run: ForgeRun;
  estimatedCost: number;
  balance: number;
}

/** Response from `GET /forge/:id/webhook-secret`. */
export interface ForgeWebhookSecret {
  /** 64-char hex HMAC key. Treat as sensitive; never log in cleartext. */
  secret: string;
  /** Ready-to-paste ingress URL, e.g. https://api.agtopen.com/forge/<id>/webhook. */
  ingressUrl: string;
  /** Header the server expects the signature under (default 'X-Agtopen-Signature'). */
  signatureHeader: string;
  /** Format string documenting the expected value (default 'sha256=<hex>'). */
  signatureFormat: string;
}

/** Payload that Forge delivers to a `call-webhook` action target. */
export interface ForgeWebhookEvent {
  /** Event kind (e.g. 'run.completed', 'run.failed', 'agent.deployed'). */
  type: string;
  agentId: string;
  runId?: string;
  /** ISO-8601 timestamp set by the dispatcher. */
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Constant-time hex comparison. We never reveal early-exit timing to
 * an attacker poking the webhook endpoint with crafted signatures.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
