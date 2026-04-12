import { AgtOpenClient } from './client';
import type { NodeConfig, TaskRequest } from './types';

/**
 * AgtOpen Node — Connect compute resources to the network.
 *
 * @example
 * ```ts
 * const node = new AgtOpenNode({
 *   token: 'your-jwt-token',
 *   capabilities: { gpu: true, vram: 8192, ram: 32768 },
 *   onTask: async (task) => {
 *     // Process the task
 *     return { result: 'computed' }
 *   }
 * })
 * await node.start()
 * ```
 */
export class AgtOpenNode extends AgtOpenClient {
  private config: NodeConfig;
  private ws: WebSocket | null = null;
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private running = false;

  constructor(config: NodeConfig) {
    super(config);
    this.config = config;
  }

  async start(): Promise<void> {
    this.running = true;

    // Register node via REST
    await this.post('/nodes/register', {
      fingerprint: this.generateFingerprint(),
      metadata: this.config.capabilities || {},
    });

    this.log('info', 'Node registered');

    // Connect WebSocket for real-time task dispatch
    this.connect();

    // Start polling for tasks as fallback
    this.startTaskPolling();
  }

  private connect(): void {
    const wsUrl = this.config.wsUrl || 'wss://ws.agtopen.com';
    try {
      this.ws = new WebSocket(`${wsUrl}/node`);

      this.ws.onopen = () => {
        this.log('info', 'WebSocket connected');
        this.reconnectAttempts = 0;

        // Send handshake
        this.ws?.send(JSON.stringify({
          type: 'handshake_request',
          token: this.token,
          capabilities: this.config.capabilities || {},
          maxConcurrentTasks: this.config.maxConcurrentTasks || 5,
          protocolVersion: '2.0.0',
          timestamp: Date.now(),
        }));
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(typeof event.data === 'string' ? event.data : '');

          if (msg.type === 'heartbeat_ping') {
            this.ws?.send(JSON.stringify({ type: 'heartbeat_pong', timestamp: Date.now() }));
            return;
          }

          if (msg.type === 'task_assign') {
            await this.handleTask(msg);
          }
        } catch (err) {
          this.log('error', 'Message handling error:', err);
        }
      };

      this.ws.onclose = () => {
        this.log('warn', 'WebSocket disconnected');
        if (this.running) this.reconnect();
      };

      this.ws.onerror = (err) => {
        this.log('error', 'WebSocket error:', err);
      };
    } catch (err) {
      this.log('warn', 'WebSocket connection failed, using REST polling');
    }
  }

  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log('error', 'Max reconnect attempts reached');
      return;
    }
    const delays = [1000, 2000, 5000, 10000, 30000, 60000];
    const delay = delays[Math.min(this.reconnectAttempts, delays.length - 1)];
    this.reconnectAttempts++;
    this.log('info', `Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), delay);
  }

  private async handleTask(msg: any): Promise<void> {
    const task: TaskRequest = {
      type: msg.taskType,
      taskId: msg.taskId,
      payload: msg.payload,
      timestamp: Date.now(),
    };

    // Send ACK
    this.ws?.send(JSON.stringify({ type: 'task_ack', taskId: task.taskId, timestamp: Date.now() }));

    try {
      const start = Date.now();
      const result = await this.config.onTask(task);
      const executionTimeMs = Date.now() - start;

      this.ws?.send(JSON.stringify({
        type: 'task_result',
        taskId: task.taskId,
        result: result.result ?? result,
        executionTimeMs,
        timestamp: Date.now(),
      }));
    } catch (err) {
      this.ws?.send(JSON.stringify({
        type: 'task_reject',
        taskId: task.taskId,
        reason: err instanceof Error ? err.message : 'Unknown error',
        timestamp: Date.now(),
      }));
    }
  }

  private startTaskPolling(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        // Heartbeat
        await this.post('/nodes/heartbeat');

        // Poll for tasks (fallback if WS not connected)
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          const { tasks } = await this.get<{ tasks: any[] }>('/nodes/tasks');
          for (const task of tasks || []) {
            await this.handleRestTask(task);
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 30_000);
  }

  private async handleRestTask(task: any): Promise<void> {
    try {
      const start = Date.now();
      const result = await this.config.onTask({
        type: task.type,
        taskId: task.id,
        payload: task.payload || {},
        timestamp: Date.now(),
      });

      await this.post(`/nodes/tasks/${task.id}/complete`, {
        result: result.result ?? result,
        executionTimeMs: Date.now() - start,
      });
    } catch (err) {
      this.log('error', 'REST task failed:', err);
    }
  }

  private generateFingerprint(): string {
    const parts = [
      typeof process !== 'undefined' ? process.arch : 'unknown',
      typeof process !== 'undefined' ? process.platform : 'unknown',
      Date.now().toString(36),
    ];
    return parts.join('-');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.ws) this.ws.close();
    this.log('info', 'Node stopped');
  }
}
