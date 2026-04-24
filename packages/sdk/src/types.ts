/** Base configuration for all AgtOpen services */
export interface AgtOpenConfig {
  /** API base URL (default: https://api.agtopen.com) */
  apiUrl?: string;
  /** WebSocket URL (default: wss://ws.agtopen.com) */
  wsUrl?: string;
  /** Authentication token (JWT) */
  token?: string;
  /** Email for OTP-based auth */
  email?: string;
  /** Enable debug logging */
  debug?: boolean;
}

// ── Agent Types ──

export interface AgentConfig extends AgtOpenConfig {
  name: string;
  description: string;
  type: string;
  emoji?: string;
  color?: string;
  expertise?: string[];
  protocol?: string;
  version?: string;
  /** Port to listen on for incoming tasks (default: 8080) */
  port?: number;
  /** Handler for incoming tasks */
  onTask: TaskHandler;
  /** Optional health check handler (default returns { status: 'ok' }) */
  onHealthCheck?: () => Promise<Record<string, unknown>>;
}

export type TaskHandler = (task: TaskRequest) => Promise<TaskResponse>;

export interface TaskRequest {
  type: string;
  taskId: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface TaskResponse {
  taskId: string;
  result: Record<string, unknown>;
  timestamp: number;
  executionTimeMs?: number;
}

// ── Data Provider Types ──

export interface ProviderConfig extends AgtOpenConfig {
  name: string;
  description: string;
  type: 'price_feed' | 'on_chain' | 'sentiment' | 'news' | 'weather' | 'sports' | 'custom';
  emoji?: string;
  tags?: string[];
  updateFrequencyMs?: number;
  outputSchema?: Record<string, string>;
  port?: number;
  /** Handler that returns current data */
  onData: () => Promise<Record<string, unknown>>;
  onHealthCheck?: () => Promise<Record<string, unknown>>;
}

// ── Tool Types ──

export interface ToolConfig extends AgtOpenConfig {
  name: string;
  description: string;
  type: 'calculator' | 'api_bridge' | 'scraper' | 'analytics' | 'transformer' | 'notifier' | 'custom';
  emoji?: string;
  tags?: string[];
  version?: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  port?: number;
  /** Handler for tool execution */
  onExecute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onHealthCheck?: () => Promise<Record<string, unknown>>;
}

// ── Node Types ──

export interface NodeConfig extends AgtOpenConfig {
  /** Capabilities of this node */
  capabilities?: {
    gpu?: boolean;
    vram?: number;
    cpu?: string;
    ram?: number;
    platform?: string;
  };
  /** Max concurrent tasks */
  maxConcurrentTasks?: number;
  /** Task handler */
  onTask: TaskHandler;
}

// ── Validator Types ──

export interface ValidatorConfig extends AgtOpenConfig {}

export interface ValidationTask {
  id: string;
  type: string;
  title: string;
  description: string;
  options: string[];
  difficulty: number;
  xpReward: number;
  expiresAt: string;
}

// ── Common ──

export interface RegistrationResult {
  id: string;
  status: string;
  message?: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
