import { AgtOpenClient } from './client';
import type { ProviderConfig, RegistrationResult } from './types';

/**
 * AgtOpen Data Provider — Run an oracle data feed on the network.
 *
 * @example
 * ```ts
 * const provider = new AgtOpenProvider({
 *   name: 'BTC Price Feed',
 *   description: 'Real-time Bitcoin price from multiple exchanges',
 *   type: 'price_feed',
 *   token: 'your-jwt-token',
 *   onData: async () => ({
 *     price: 65432.10,
 *     symbol: 'BTC/USD',
 *     timestamp: Date.now(),
 *   })
 * })
 * await provider.start()
 * ```
 */
export class AgtOpenProvider extends AgtOpenClient {
  private config: ProviderConfig;
  private server: any = null;
  private registrationId?: string;
  private heartbeatInterval?: ReturnType<typeof setInterval>;

  constructor(config: ProviderConfig) {
    super(config);
    this.config = config;
  }

  async start(): Promise<RegistrationResult> {
    const port = this.config.port || 8081;

    this.server = Bun.serve({
      port,
      fetch: async (req) => {
        const url = new URL(req.url);

        if (req.method === 'GET' && url.pathname === '/health') {
          const health = this.config.onHealthCheck
            ? await this.config.onHealthCheck()
            : { status: 'ok', provider: this.config.name, timestamp: Date.now() };
          return Response.json(health);
        }

        if (req.method === 'GET' && url.pathname === '/data') {
          try {
            const data = await this.config.onData();
            return Response.json(data);
          } catch (err) {
            this.log('error', 'Data fetch failed:', err);
            return Response.json({ error: 'Data fetch failed' }, { status: 500 });
          }
        }

        return Response.json({ error: 'Not found' }, { status: 404 });
      },
    });

    this.log('info', `Provider server listening on port ${port}`);

    const endpointUrl = process.env.AGTOPEN_ENDPOINT_URL || `http://localhost:${port}`;
    const result = await this.post<RegistrationResult>('/data-providers/register', {
      name: this.config.name,
      description: this.config.description,
      type: this.config.type,
      emoji: this.config.emoji || '📡',
      tags: this.config.tags || [],
      endpointUrl,
      dataFormat: 'json',
      updateFrequencyMs: this.config.updateFrequencyMs || 60000,
      outputSchema: this.config.outputSchema || {},
    });

    this.registrationId = result.id;
    this.startHeartbeat();
    this.log('info', `Provider registered: ${result.id} (${result.status})`);
    return result;
  }

  private startHeartbeat(): void {
    if (!this.registrationId) return;
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.post(`/data-providers/${this.registrationId}/heartbeat`);
      } catch (err) {
        this.log('warn', 'Heartbeat failed:', err);
      }
    }, 60_000);
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.server) this.server.stop();
    this.log('info', 'Provider stopped');
  }
}
