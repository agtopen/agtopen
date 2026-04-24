import type { AgtOpenConfig, LogLevel } from './types.js';

const DEFAULT_API_URL = 'https://api.agtopen.com';

export class AgtOpenClient {
  protected apiUrl: string;
  protected token?: string;
  protected debug: boolean;

  constructor(config: AgtOpenConfig) {
    this.apiUrl = (config.apiUrl || DEFAULT_API_URL).replace(/\/+$/, '');
    this.token = config.token;
    this.debug = config.debug ?? false;
  }

  protected log(level: LogLevel, ...args: unknown[]): void {
    if (!this.debug && level === 'debug') return;
    const prefix = `[agtopen:${level}]`;
    switch (level) {
      case 'error': console.error(prefix, ...args); break;
      case 'warn': console.warn(prefix, ...args); break;
      default: console.log(prefix, ...args);
    }
  }

  protected async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    this.log('debug', `${method} ${path}`);

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = (data as any)?.error || `HTTP ${res.status}`;
      throw new AgtOpenError(msg, res.status, data);
    }

    return data as T;
  }

  protected get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  protected post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /** Authenticate via email OTP */
  async requestOtp(email: string, type: 'signup' | 'login' = 'login'): Promise<void> {
    await this.post('/auth/request-otp', { email, type });
    this.log('info', `OTP sent to ${email}`);
  }

  /** Verify OTP and store token */
  async verifyOtp(email: string, code: string, type: 'signup' | 'login' = 'login'): Promise<void> {
    const res = await this.post<{ tokens: { accessToken: string } }>('/auth/verify-otp', { email, code, type });
    this.token = res.tokens.accessToken;
    this.log('info', 'Authenticated successfully');
  }
}

export class AgtOpenError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'AgtOpenError';
  }
}
