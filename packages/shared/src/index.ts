// Types
export * from './types/agent';
export * from './types/prediction';
export * from './types/user';
export * from './types/feed';
export * from './types/comms';
export * from './types/events';

// Constants
export { GENESIS_AGENTS, FOUNDATION_AGENTS, AGENT_MAP, ORIGINAL_CORE_IDS, EXPANDED_CORE_IDS, SWARM_BACKBONE_IDS } from './constants/agents';
export {
  COLORS,
  FONTS,
  ATOMS,
  RATE_LIMITS,
  TRACKED_MARKETS,
  STOCK_MARKETS,
  FOREX_MARKETS,
  METAL_MARKETS,
  ALL_MARKETS,
  TERRITORY_ZONES,
} from './constants/config';
export { AI_MODELS, TASK_MODELS } from './constants/models';
export type { AIModel } from './constants/models';
export { TIER_ACCESS, getTierAccess, canAccess, getLimit, meetsMinTier } from './constants/tiers';
export type { TierAccess } from './constants/tiers';

// Node tier ladder (5-tier: spark / ember / blaze / storm / nexus).
// This is the canonical definition — backend, extension, and web UI
// all import from here. See node-tiers.ts header for the migration
// story from the legacy 4-tier seed/flame/storm/vortex system.
export {
  TIER_ORDER as NODE_TIER_ORDER,
  TIER_MIN_TASKS as NODE_TIER_MIN_TASKS,
  TIER_MIN_DAYS as NODE_TIER_MIN_DAYS,
  TIER_MIN_TRUST as NODE_TIER_MIN_TRUST,
  TIER_MULTIPLIERS as NODE_TIER_MULTIPLIERS,
  TIER_DAILY_CAP as NODE_TIER_DAILY_CAP,
  TIER_MAX_TASKS_DAY as NODE_TIER_MAX_TASKS_DAY,
  TIER_TASKS as NODE_TIER_TASKS,
  LEGACY_TIER_MAP as NODE_TIER_LEGACY_MAP,
  getTierRank as getNodeTierRank,
  nextTier as nextNodeTier,
  qualifiesForTier as qualifiesForNodeTier,
  normalizeTier as normalizeNodeTier,
} from './constants/node-tiers';
export type { NodeTier } from './constants/node-tiers';

// Canonical 128-bit hash. Used by web /node, extension, AND
// agent-engine result-collector so the /nodes/claim-reward
// resultHash comparison actually matches. See utils/hash.ts header
// for the 409 "Result hash mismatch" bug this fixes.
export { hashData } from './utils/hash';

// AI Client + quota circuit breaker
export {
  getAIClient,
  aiComplete,
  aiJSON,
  aiStream,
  QuotaBreakerOpenError,
  classifyLLMError,
  formatLLMError,
  shouldLogLLMError,
  isQuotaBreakerOpen,
  quotaBreakerRemainingMs,
  tripQuotaBreaker,
} from './ai/client';
export type { ClassifiedLLMError } from './ai/client';

// Validators
export { signupSchema, loginSchema, refreshSchema, requestOtpSchema, verifyOtpSchema } from './validators/auth';
export type { SignupInput, LoginInput, RefreshInput, RequestOtpInput, VerifyOtpInput } from './validators/auth';
export type { OtpResponse, AuthResponse } from './types/user';
