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

  /** Trigger a manual run */
  async run(agentId: string): Promise<void> {
    await this.post(`/forge/${agentId}/run`);
  }

  /** Create + deploy + start in one call */
  async createAndDeploy(config: ForgeCreateConfig): Promise<ForgeAgent> {
    const agent = await this.create(config);
    await this.deploy(agent.id);
    await this.start(agent.id);
    await this.run(agent.id); // First run
    return agent;
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
