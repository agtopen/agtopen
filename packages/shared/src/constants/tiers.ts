import type { UserTier } from '../types/user';

export interface TierAccess {
  maxConsultMessages: number;
  maxAgoraMessages: number;
  canStake: boolean;
  canBreed: boolean;
  canCreateGuild: boolean;
  canCreateProposal: boolean;
  canBetArena: boolean;
  maxArenaBet: number;
  canAccessFutures: boolean;
  canRunNode: boolean;
  canAccessWire: boolean;
  canAccessTerritory: boolean;
  canJoinProphecy: boolean;
  dataDelay: number;
  /** Max active forge agents (not counting archived). Hard cap — user
   *  cannot create beyond this without tier upgrade. -1 = unlimited. */
  maxForgeAgents: number;
  /** Max forge agent CREATIONS per 24 h. Separate from the active cap
   *  because users can create + archive in a loop to circumvent the
   *  active-cap alone. */
  forgeCreatesPerDay: number;
  /** Max manual /forge/:id/run triggers per hour. Stops one user from
   *  spamming runs and burning through their atoms + our LLM bill. */
  forgeRunsPerHour: number;
}

const TIER_HIERARCHY: Record<UserTier, number> = {
  free: 0,
  pro: 1,
  sovereign: 2,
};

export const TIER_ACCESS: Record<UserTier, TierAccess> = {
  free: {
    maxConsultMessages: 5,
    maxAgoraMessages: 10,
    canStake: true,
    canBreed: false,
    canCreateGuild: false,
    canCreateProposal: false,
    canBetArena: true,
    maxArenaBet: 100,
    canAccessFutures: false,
    canRunNode: true,
    canAccessWire: true,
    canAccessTerritory: false,
    canJoinProphecy: false,
    dataDelay: 60_000,
    // 3 agents is enough to try the product + see the value loop;
    // anyone running real workloads upgrades to Pro.
    maxForgeAgents: 3,
    forgeCreatesPerDay: 10,
    forgeRunsPerHour: 20,
  },
  pro: {
    maxConsultMessages: 50,
    maxAgoraMessages: 100,
    canStake: true,
    canBreed: true,
    canCreateGuild: true,
    canCreateProposal: true,
    canBetArena: true,
    maxArenaBet: 10_000,
    canAccessFutures: true,
    canRunNode: true,
    canAccessWire: true,
    canAccessTerritory: true,
    canJoinProphecy: true,
    dataDelay: 15_000,
    // Pro covers the "power user with a handful of production agents"
    // — enough headroom for an agency but not a bot farm.
    maxForgeAgents: 25,
    forgeCreatesPerDay: 100,
    forgeRunsPerHour: 200,
  },
  sovereign: {
    maxConsultMessages: -1,
    maxAgoraMessages: -1,
    canStake: true,
    canBreed: true,
    canCreateGuild: true,
    canCreateProposal: true,
    canBetArena: true,
    maxArenaBet: -1,
    canAccessFutures: true,
    canRunNode: true,
    canAccessWire: true,
    canAccessTerritory: true,
    canJoinProphecy: true,
    dataDelay: 0,
    // Sovereign is the "API / platform" tier — big caps, not
    // unlimited, so a single compromised key can't DoS the fleet.
    maxForgeAgents: 200,
    forgeCreatesPerDay: 1000,
    forgeRunsPerHour: 2000,
  },
} as const;

/**
 * Get the full access configuration for a tier.
 */
export function getTierAccess(tier: UserTier): TierAccess {
  return TIER_ACCESS[tier];
}

/**
 * Check whether a tier grants access to a boolean feature.
 * For numeric limits, returns true if the value is non-zero (or -1 for unlimited).
 */
export function canAccess(tier: UserTier, feature: keyof TierAccess): boolean {
  const value = TIER_ACCESS[tier][feature];
  if (typeof value === 'boolean') return value;
  // Numeric: -1 means unlimited, 0 means no access, >0 means has access
  return value !== 0;
}

/**
 * Get the numeric limit for a tier feature.
 * Returns -1 for unlimited, or the configured cap.
 */
export function getLimit(tier: UserTier, limit: keyof TierAccess): number {
  const value = TIER_ACCESS[tier][limit];
  if (typeof value === 'number') return value;
  // Boolean features: true = -1 (unlimited), false = 0
  return value ? -1 : 0;
}

/**
 * Check whether `tier` meets or exceeds `minTier` in the hierarchy.
 */
export function meetsMinTier(tier: UserTier, minTier: UserTier): boolean {
  return TIER_HIERARCHY[tier] >= TIER_HIERARCHY[minTier];
}
