/**
 * Deterministic 128-bit hash for cross-boundary integrity checks.
 *
 * Used as the canonical `resultHash` algorithm so the web /node client,
 * the Chrome extension, and the agent-engine result-collector all
 * produce IDENTICAL hashes for the same input string. Before this
 * shared module existed the codebase had TWO different hash functions:
 *
 *   - Clients (web + extension): FNV-1a 128-bit → 64 hex chars
 *   - Server (agent-engine):     djb2 32-bit    → 8  hex chars
 *
 * Every single /nodes/claim-reward call therefore failed with 409
 * "Result hash mismatch" because the strings being compared had
 * different LENGTHS, never mind different content — user report
 * "3 tasks done, Balance 0, Today +9.9" was exactly this.
 *
 * NOT cryptographically secure. The only requirement is:
 *
 *   1. Deterministic: same input → same output across runs, browsers,
 *      and JS engines.
 *   2. Fast: runs inline on the hot path of every task result.
 *   3. Good distribution: we use the hash as a consensus grouping key,
 *      so collisions between distinct task results waste agreement
 *      math. FNV-1a with four accumulators and four distinct primes
 *      gives ~128 bits of distribution — more than enough for the
 *      thousand-tasks-per-minute traffic we're projecting at launch.
 *
 * 128 bits / 16 bytes / 32 hex chars would be enough on its own, but
 * we emit 64 hex chars (8 × 32-bit words) because the extension
 * already wrote that shape into the protocol handshake — changing it
 * would force a simultaneous extension update + DB reseed. Cheap to
 * keep; costly to churn.
 */
export function hashData(input: string): string {
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x01000193 >>> 0;
  let h3 = 0xdeadbeef >>> 0;
  let h4 = 0xcafebabe >>> 0;

  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
    h3 = Math.imul(h3 ^ c, 0x1b873593) >>> 0;
    h4 = Math.imul(h4 ^ c, 0xcc9e2d51) >>> 0;
  }

  h1 = (h1 ^ (h1 >>> 16)) >>> 0;
  h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  h3 = (h3 ^ (h3 >>> 16)) >>> 0;
  h4 = (h4 ^ (h4 >>> 13)) >>> 0;

  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return (
    hex(h1) + hex(h2) + hex(h3) + hex(h4)
    + hex(h1 ^ h2) + hex(h2 ^ h3) + hex(h3 ^ h4) + hex(h4 ^ h1)
  );
}
