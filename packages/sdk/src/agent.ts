import { AgtOpenClient } from './client';
import type { AgentConfig, TaskRequest, TaskResponse, RegistrationResult } from './types';

/**
 * AgtOpen Agent — Register and run an AI agent on the network.
 *
 * @example
 * ```ts
 * const agent = new AgtOpenAgent({
 *   name: 'Price Oracle',
 *   description: 'Real-time crypto price analysis',
 *   type: 'price_feed',
 *   token: 'your-jwt-token',
 *   onTask: async (task) => {
 *     return { price: 65000, symbol: task.payload.symbol }
 *   }
 * })
 * await agent.start()
 * ```
 */
export class AgtOpenAgent extends AgtOpenClient {
  private config: AgentConfig;
  private server: any = null;
  private registrationId?: string;
  private heartbeatInterval?: ReturnType<typeof setInterval>;

  constructor(config: AgentConfig) {
    super(config);
    this.config = config;
  }

  /** Register agent with the network and start listening for tasks */
  async start(): Promise<RegistrationResult> {
    const port = this.config.port || 8080;

    // Start HTTP server to receive tasks
    this.server = Bun.serve({
      port,
      fetch: async (req) => {
        const url = new URL(req.url);

        if (req.method === 'GET' && url.pathname === '/health') {
          const health = this.config.onHealthCheck
            ? await this.config.onHealthCheck()
            : { status: 'ok', agent: this.config.name, timestamp: Date.now() };
          return Response.json(health);
        }

        if (req.method === 'POST' && url.pathname === '/task') {
          try {
            const task = (await req.json()) as TaskRequest;
            const start = Date.now();
            const result = await this.config.onTask(task);
            const response: TaskResponse = {
              taskId: task.taskId,
              result: result.result ?? result as any,
              timestamp: Date.now(),
              executionTimeMs: Date.now() - start,
            };
            return Response.json(response);
          } catch (err) {
            this.log('error', 'Task execution failed:', err);
            return Response.json({ error: 'Task execution failed' }, { status: 500 });
          }
        }

        return Response.json({ error: 'Not found' }, { status: 404 });
      },
    });

    this.log('info', `Agent server listening on port ${port}`);

    // Register with the network
    const result = await this.register(port);
    this.registrationId = result.id;

    // Start heartbeat
    this.startHeartbeat();

    this.log('info', `Agent registered: ${result.id} (${result.status})`);
    return result;
  }

  private async register(port: number): Promise<RegistrationResult> {
    // Determine public URL (user can override via endpointUrl env var)
    const endpointUrl = process.env.AGTOPEN_ENDPOINT_URL || `http://localhost:${port}`;

    return this.post<RegistrationResult>('/registry/register', {
      name: this.config.name,
      description: this.config.description,
      type: this.config.type,
      emoji: this.config.emoji || '🤖',
      color: this.config.color || '#6366F1',
      expertise: this.config.expertise || [],
      endpointUrl,
      protocol: this.config.protocol || 'agtopen-v1',
      version: this.config.version || '1.0.0',
    });
  }

  private startHeartbeat(): void {
    if (!this.registrationId) return;
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.post(`/registry/${this.registrationId}/heartbeat`);
        this.log('debug', 'Heartbeat sent');
      } catch (err) {
        this.log('warn', 'Heartbeat failed:', err);
      }
    }, 30_000);
  }

  /** Stop the agent */
  async stop(): Promise<void> {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.server) this.server.stop();
    this.log('info', 'Agent stopped');
  }
}
