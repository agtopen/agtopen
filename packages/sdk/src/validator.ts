import { AgtOpenClient } from './client.js';
import type { ValidatorConfig, ValidationTask } from './types.js';

/**
 * AgtOpen Validator — Verify outcomes and earn XP.
 *
 * @example
 * ```ts
 * const validator = new AgtOpenValidator({ token: 'your-jwt-token' })
 * await validator.join()
 * const tasks = await validator.getTasks()
 * await validator.vote(tasks[0].id, 'Yes', 0.9)
 * ```
 */
export class AgtOpenValidator extends AgtOpenClient {
  constructor(config: ValidatorConfig) {
    super(config);
  }

  /** Join as a validator */
  async join(): Promise<{ id: string; status: string }> {
    return this.post('/validators/join');
  }

  /** Get my validator profile */
  async getProfile(): Promise<any> {
    const res = await this.get<{ validator: any }>('/validators/me');
    return res.validator;
  }

  /** Get available validation tasks */
  async getTasks(limit = 20): Promise<ValidationTask[]> {
    const res = await this.get<{ tasks: ValidationTask[] }>(`/validators/tasks?limit=${limit}`);
    return res.tasks;
  }

  /** Get task details */
  async getTask(taskId: string): Promise<any> {
    return this.get(`/validators/tasks/${taskId}`);
  }

  /** Cast a vote on a task */
  async vote(taskId: string, answer: string, confidence = 0.5): Promise<{ voteId: string }> {
    return this.post(`/validators/tasks/${taskId}/vote`, { answer, confidence });
  }

  /** Get leaderboard */
  async getLeaderboard(limit = 50): Promise<any[]> {
    const res = await this.get<{ validators: any[] }>(`/validators/leaderboard?limit=${limit}`);
    return res.validators;
  }
}
