/**
 * Node Tier ladder — canonical 5-tier system (Apr 2026 rework).
 *
 * Previously the codebase had THREE divergent tier ladders:
 *
 *   - apps/api-core + DB:              seed / flame / storm / vortex (4)
 *   - apps/agent-engine/node-network:  seed / flame / storm / vortex
 *                                      + titan / apex / sovereign   (7)
 *   - apps/extension:                  spark / ember / blaze /
 *                                      storm / nexus                (5)
 *
 * The 5-tier version was the newest design (a user-facing tier system
 * with three gates: task count + days active + trust score). The 4-tier
 * version was what actually shipped on the web /node page, and the
 * 7-tier version was a half-written spec in the protocol header.
 *
 * This file is the ONLY source of truth from now on. Every consumer
 * (backend reward pipeline, extension, web /node UI) imports from here.
 *
 * Migration mapping for legacy DB rows:
 *   old 'seed'   → new 'spark'   (0 tasks, same)
 *   old 'flame'  → new 'ember'   (500 tasks, same)
 *   old 'storm'  → new 'blaze'   (2 000 tasks, same thresholds)
 *   old 'vortex' → new 'storm'   (10 000 tasks, same thresholds)
 *
 * The new top tier 'nexus' (50 000 tasks / 180 days / 0.9 trust) has no
 * prior-tier rows to migrate — it simply becomes the new ceiling.
 */

export type NodeTier = 'spark' | 'ember' | 'blaze' | 'storm' | 'nexus';

export const TIER_ORDER: readonly NodeTier[] = ['spark', 'ember', 'blaze', 'storm', 'nexus'];

/** Minimum tasks completed to qualify for a tier. */
export const TIER_MIN_TASKS: Record<NodeTier, number> = {
  spark: 0,
  ember: 500,
  blaze: 2_000,
  storm: 10_000,
  nexus: 50_000,
};

/** Minimum days active (since node creation) to qualify for a tier. */
export const TIER_MIN_DAYS: Record<NodeTier, number> = {
  spark: 0,
  ember: 7,
  blaze: 30,
  storm: 90,
  nexus: 180,
};

/** Minimum trust score (0–1 scale) to qualify for a tier. */
export const TIER_MIN_TRUST: Record<NodeTier, number> = {
  spark: 0.50,
  ember: 0.60,
  blaze: 0.70,
  storm: 0.80,
  nexus: 0.90,
};

/** Reward multiplier per tier — applied on top of per-task reward. */
export const TIER_MULTIPLIERS: Record<NodeTier, number> = {
  spark: 1.0,
  ember: 1.1,
  blaze: 1.3,
  storm: 1.6,
  nexus: 2.0,
};

/**
 * Daily Atoms earning cap per tier.
 *
 * Scales with tier rather than being a flat 500 as the old system did,
 * so higher tiers actually see rate-of-earnings go up, not just
 * per-task reward. This is what turns "reach flame" from a vanity
 * badge into an economic reason to keep running the node.
 */
export const TIER_DAILY_CAP: Record<NodeTier, number> = {
  spark: 500,
  ember: 1_500,
  blaze: 3_500,
  storm: 8_000,
  nexus: 20_000,
};

/** Max tasks per day per tier — hard safety ceiling above the Atoms cap. */
export const TIER_MAX_TASKS_DAY: Record<NodeTier, number> = {
  spark: 100,
  ember: 200,
  blaze: 350,
  storm: 500,
  nexus: 800,
};

/** Task types unlocked at each tier. Higher tiers inherit everything
 *  lower tiers can do. Mirrors task-engine.TASK_CONFIGS.minTier exactly
 *  — if you change one you MUST change the other. The enforcement
 *  point is task-engine; this is the UI-facing lookup. */
export const TIER_TASKS: Record<NodeTier, readonly string[]> = {
  spark: ['price_witness', 'protocol_health'],
  ember: ['price_witness', 'protocol_health', 'sentiment_pulse', 'news_relay'],
  blaze: ['price_witness', 'protocol_health', 'sentiment_pulse', 'news_relay', 'rpc_verify', 'zk_verify'],
  storm: ['price_witness', 'protocol_health', 'sentiment_pulse', 'news_relay', 'rpc_verify', 'zk_verify', 'swarm_slice'],
  // nexus unlocks no new task type on top of storm — the benefit is
  // purely economic (2× multiplier + 20k daily cap). This preserves
  // the old 4-tier gating 1:1 while giving the new top tier a
  // reason to exist.
  nexus: ['price_witness', 'protocol_health', 'sentiment_pulse', 'news_relay', 'rpc_verify', 'zk_verify', 'swarm_slice'],
};

/** Numeric rank helper (0=spark, 4=nexus). Useful for min-tier gating
 *  on task assignment: `getTierRank(node.tier) >= getTierRank(task.minTier)`. */
export function getTierRank(tier: NodeTier): number {
  return TIER_ORDER.indexOf(tier);
}

/** Next tier in the ladder, or null if already at nexus. */
export function nextTier(current: NodeTier): NodeTier | null {
  const idx = TIER_ORDER.indexOf(current);
  if (idx === -1 || idx === TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

/** Returns true iff a node qualifies for the given tier given its
 *  stats. All three gates (tasks + days + trust) must be met. */
export function qualifiesForTier(
  target: NodeTier,
  stats: { tasksCompleted: number; daysActive: number; trustScore: number },
): boolean {
  return (
    stats.tasksCompleted >= TIER_MIN_TASKS[target]
    && stats.daysActive >= TIER_MIN_DAYS[target]
    && stats.trustScore >= TIER_MIN_TRUST[target]
  );
}

/**
 * Migration-time mapping from legacy 4-tier names to 5-tier names.
 *
 * Kept here (rather than only in the SQL migration) so runtime code
 * can also coerce stale strings — e.g. a cached response from an old
 * client, or an event written before the migration landed.
 */
export const LEGACY_TIER_MAP: Record<string, NodeTier> = {
  seed: 'spark',
  flame: 'ember',
  // Note: the old 'storm' (2000 tasks, 30 days) becomes the new 'blaze' —
  // thresholds match. New 'storm' is the old 'vortex' (10k tasks, 90
  // days), also thresholds match.
  storm: 'blaze',
  vortex: 'storm',
  // Also absorb 7-tier protocol values (titan/apex/sovereign) into nexus —
  // they were never actually populated in DB but ts code referenced them.
  titan: 'nexus',
  apex: 'nexus',
  sovereign: 'nexus',
};

/** Coerce any legacy tier string into a 5-tier value. Unknown values
 *  fall back to 'spark' so nothing ever blows up on a bad cache. */
export function normalizeTier(raw: string | null | undefined): NodeTier {
  if (!raw) return 'spark';
  const lower = raw.toLowerCase();
  if ((TIER_ORDER as readonly string[]).includes(lower)) return lower as NodeTier;
  return LEGACY_TIER_MAP[lower] ?? 'spark';
}
