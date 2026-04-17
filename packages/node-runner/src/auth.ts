/**
 * Interactive auth helpers for node-runner.
 *
 * Flow when no AGTOPEN_TOKEN is present:
 *   1. Check ~/.agtopen/token (cached from a previous run).
 *   2. If absent, prompt for email in the terminal.
 *   3. POST /auth/request-otp { email, type: 'login' }.
 *   4. Prompt for the 6-digit code.
 *   5. POST /auth/verify-otp → receive access + refresh tokens.
 *   6. Write the access token to ~/.agtopen/token (chmod 600).
 *   7. Return the token so the runner can proceed.
 *
 * The cached file is an opaque JWT string; on every run we first try it,
 * and only fall back to the OTP flow if the server rejects it.
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout, env } from 'node:process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_API = 'https://api.agtopen.com';
const CACHE_DIR = path.join(os.homedir(), '.agtopen');
const CACHE_FILE = path.join(CACHE_DIR, 'token');

export async function readCachedToken(): Promise<string | null> {
  try {
    const contents = await fs.readFile(CACHE_FILE, 'utf8');
    const t = contents.trim();
    return t.length > 20 ? t : null;
  } catch { return null; }
}

export async function writeCachedToken(token: string): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, token + '\n', { mode: 0o600 });
    // Defensive: if the file already existed with wider perms, tighten it.
    try { await fs.chmod(CACHE_FILE, 0o600); } catch { /* noop */ }
  } catch (err) {
    process.stderr.write(`  ⚠  could not cache token at ${CACHE_FILE}: ${(err as Error).message}\n`);
  }
}

export async function removeCachedToken(): Promise<void> {
  try { await fs.rm(CACHE_FILE, { force: true }); } catch { /* noop */ }
}

/**
 * Verify a token is still valid by calling /auth/me. Returns true on 200,
 * false on any 4xx (expired, invalid signature, revoked). Network errors
 * bubble up so callers can fall back gracefully.
 */
export async function verifyToken(token: string, apiUrl = DEFAULT_API): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function rlOnce(): { ask: (q: string) => Promise<string>; close: () => void } {
  const rl = createInterface({ input: stdin, output: stdout });
  return {
    ask: (q) => rl.question(q),
    close: () => rl.close(),
  };
}

/**
 * Drive the email-OTP flow to completion. Writes the token to the cache
 * file on success and returns it.
 */
export async function interactiveLogin(opts: { apiUrl?: string } = {}): Promise<string> {
  const apiUrl = opts.apiUrl ?? env.AGTOPEN_API_URL ?? DEFAULT_API;

  process.stdout.write(`\n  Signing in to ${apiUrl} …\n`);

  const rl = rlOnce();
  try {
    const email = (await rl.ask('  Email: ')).trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      throw new Error(`Invalid email: ${email}`);
    }

    // Request OTP
    const reqRes = await fetch(`${apiUrl}/auth/request-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, type: 'login' }),
    });
    if (!reqRes.ok) {
      const body = await reqRes.text().catch(() => '');
      throw new Error(`request-otp failed (${reqRes.status}): ${body.slice(0, 200)}`);
    }
    process.stdout.write(`  ✓ 6-digit code sent to ${email}\n`);

    const code = (await rl.ask('  Code:  ')).trim();
    if (!/^\d{4,8}$/.test(code)) {
      throw new Error(`Invalid code: expected digits, got "${code}"`);
    }

    // Verify OTP
    const verRes = await fetch(`${apiUrl}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code, type: 'login' }),
    });
    if (!verRes.ok) {
      const body = await verRes.text().catch(() => '');
      throw new Error(`verify-otp failed (${verRes.status}): ${body.slice(0, 200)}`);
    }

    const body = await verRes.json().catch(() => ({})) as { tokens?: { accessToken?: string }; accessToken?: string };
    const token = body.tokens?.accessToken ?? body.accessToken;
    if (!token || typeof token !== 'string' || token.length < 20) {
      throw new Error('verify-otp returned no access token');
    }

    await writeCachedToken(token);
    process.stdout.write(`  ✓ Signed in. Token cached at ~/.agtopen/token (0600)\n\n`);
    return token;
  } finally {
    rl.close();
  }
}

/**
 * Resolve a token from (in order):
 *   1. AGTOPEN_TOKEN env (or --token flag — handled upstream)
 *   2. ~/.agtopen/token (if still valid)
 *   3. Interactive OTP prompt
 *
 * `explicit` is whatever the caller already parsed (flag + env). Pass null
 * if you have no token in hand yet.
 */
export async function resolveToken(
  explicit: string | undefined,
  apiUrl: string | undefined,
): Promise<string> {
  if (explicit) return explicit;

  const cached = await readCachedToken();
  if (cached) {
    if (await verifyToken(cached, apiUrl ?? DEFAULT_API)) {
      return cached;
    }
    // Cached token is stale — silently fall through to interactive login.
    await removeCachedToken();
  }

  if (!stdin.isTTY) {
    throw new Error(
      'No token and stdin is not a TTY. Set AGTOPEN_TOKEN, ' +
      'pass --token, or run interactively to sign in via email OTP.',
    );
  }

  return interactiveLogin({ apiUrl });
}
