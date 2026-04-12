import { AgtOpenClient } from './client';
import type { ToolConfig, RegistrationResult } from './types';

/**
 * AgtOpen Tool — Build a tool/plugin that agents can call.
 *
 * @example
 * ```ts
 * const tool = new AgtOpenTool({
 *   name: 'Gas Calculator',
 *   description: 'Calculate Ethereum gas costs',
 *   type: 'calculator',
 *   inputSchema: { gasLimit: 'number', gasPriceGwei: 'number' },
 *   outputSchema: { costEth: 'number', costUsd: 'number' },
 *   token: 'your-jwt-token',
 *   onExecute: async (input) => {
 *     const costEth = (input.gasLimit * input.gasPriceGwei) / 1e9;
 *     return { costEth, costUsd: costEth * 3500 }
 *   }
 * })
 * await tool.start()
 * ```
 */
export class AgtOpenTool extends AgtOpenClient {
  private config: ToolConfig;
  private server: any = null;
  private registrationId?: string;
  private heartbeatInterval?: ReturnType<typeof setInterval>;

  constructor(config: ToolConfig) {
    super(config);
    this.config = config;
  }

  async start(): Promise<RegistrationResult> {
    const port = this.config.port || 8082;

    this.server = Bun.serve({
      port,
      fetch: async (req) => {
        const url = new URL(req.url);

        if (req.method === 'GET' && url.pathname === '/health') {
          const health = this.config.onHealthCheck
            ? await this.config.onHealthCheck()
            : { status: 'ok', tool: this.config.name, timestamp: Date.now() };
          return Response.json(health);
        }

        if (req.method === 'GET' && url.pathname === '/schema') {
          return Response.json({
            name: this.config.name,
            description: this.config.description,
            input: this.config.inputSchema,
            output: this.config.outputSchema,
          });
        }

        if (req.method === 'POST' && url.pathname === '/execute') {
          try {
            const body = (await req.json()) as Record<string, unknown>;
            const input = (body.input || body) as Record<string, unknown>;
            const output = await this.config.onExecute(input);
            return Response.json({ output });
          } catch (err) {
            this.log('error', 'Tool execution failed:', err);
            return Response.json({ error: 'Execution failed' }, { status: 500 });
          }
        }

        return Response.json({ error: 'Not found' }, { status: 404 });
      },
    });

    this.log('info', `Tool server listening on port ${port}`);

    const endpointUrl = process.env.AGTOPEN_ENDPOINT_URL || `http://localhost:${port}`;
    const result = await this.post<RegistrationResult>('/tools/register', {
      name: this.config.name,
      description: this.config.description,
      type: this.config.type,
      emoji: this.config.emoji || '🔧',
      tags: this.config.tags || [],
      version: this.config.version || '1.0.0',
      endpointUrl,
      exampleInput: {},
    });

    this.registrationId = result.id;
    this.startHeartbeat();
    this.log('info', `Tool registered: ${result.id} (${result.status})`);
    return result;
  }

  private startHeartbeat(): void {
    if (!this.registrationId) return;
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.post(`/tools/${this.registrationId}/heartbeat`);
      } catch (err) {
        this.log('warn', 'Heartbeat failed:', err);
      }
    }, 60_000);
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.server) this.server.stop();
    this.log('info', 'Tool stopped');
  }
}
