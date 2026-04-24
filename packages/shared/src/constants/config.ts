// === BRAND COLORS ===
export const COLORS = {
  brand: {
    indigo: '#6366F1',
    cyan: '#06B6D4',
    emerald: '#10B981',
  },
  bg: {
    deep: '#050510',
    surface: '#0C0C1A',
    elevated: 'rgba(8, 8, 24, 0.85)',
    hover: 'rgba(255, 255, 255, 0.02)',
    active: 'rgba(255, 255, 255, 0.04)',
  },
  text: {
    primary: '#e8e8f8',
    secondary: '#999999',
    muted: '#666666',
    dim: '#444444',
    subtle: '#333333',
  },
  border: {
    default: 'rgba(255, 255, 255, 0.04)',
    hover: 'rgba(255, 255, 255, 0.08)',
    active: 'rgba(255, 255, 255, 0.12)',
  },
  agentType: {
    research: '#06B6D4',
    analysis: '#8B5CF6',
    crawler: '#F59E0B',
    prediction: '#EF4444',
    connector: '#10B981',
    security: '#F97316',
    creative: '#A855F7',
  },
  status: {
    live: '#10B981',
    paused: '#F59E0B',
    critical: '#EF4444',
    info: '#38BDF8',
  },
} as const;

// === TYPOGRAPHY ===
export const FONTS = {
  heading: 'Syne, sans-serif',
  body: 'DM Sans, sans-serif',
  data: 'JetBrains Mono, monospace',
} as const;

// === ATOMS ECONOMY ===
export const ATOMS = {
  dailyBudget: {
    season1: 100_000,
    season2: 80_000,
    season3: 65_000,
    season4: 55_000,
  },
  pools: {
    node: 0.4,
    app: 0.5,
    reserve: 0.1,
  },
  appPool: {
    quests: 0.3,
    predictions: 0.3,
    staking: 0.2,
    arena: 0.1,
    engagement: 0.1,
  },
  sinks: {
    breed: 5_000,
    createGuild: 2_000,
    customName: 500,
    consultBoost: 50,
    premiumAnalytics: 200,
  },
  stakingMultipliers: {
    noLock: 1.0,
    '7d': 1.1,
    '30d': 1.3,
    '90d': 1.5,
    season: 1.8,
  },
  accuracyMultipliers: [
    { min: 0, max: 50, multiplier: 0.5 },
    { min: 50, max: 70, multiplier: 1.0 },
    { min: 70, max: 85, multiplier: 1.3 },
    { min: 85, max: 95, multiplier: 1.6 },
    { min: 95, max: 100, multiplier: 2.0 },
  ],
} as const;

// === RATE LIMITS ===
export const RATE_LIMITS = {
  consult: {
    free: 5,
    pro: Infinity,
    sovereign: Infinity,
  },
  agora: {
    postPerDay: { free: 3, pro: Infinity, sovereign: Infinity },
    messageInterval: 5_000, // 5 seconds
    maxLength: 500,
  },
} as const;

// === MARKETS ===
// Crypto — tracked via Coingecko
export const TRACKED_MARKETS = [
  'BTC/USD',
  'ETH/USD',
  'SOL/USD',
  'BNB/USD',
  'AVAX/USD',
  'MATIC/USD',
  'ARB/USD',
  'OP/USD',
  'LINK/USD',
  'UNI/USD',
] as const;

// Traditional markets — tracked via Yahoo Finance (server-side in
// agent-engine so CORS is not a problem). Symbol format matches the
// `market` field stored on the predictions table and the regex filters
// in OraclePanel.
export const STOCK_MARKETS = [
  'SPY', 'QQQ', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMD', 'META', 'GOOGL',
] as const;

export const FOREX_MARKETS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
] as const;

export const METAL_MARKETS = [
  'XAU/USD', 'XAG/USD',
] as const;

/** Every market the oracle scheduler rotates through. */
export const ALL_MARKETS = [
  ...TRACKED_MARKETS,
  ...STOCK_MARKETS,
  ...FOREX_MARKETS,
  ...METAL_MARKETS,
] as const;

// === TERRITORY ZONES ===
export const TERRITORY_ZONES = [
  { id: 'crypto-core', name: 'Crypto Core', color: '#EF4444' },
  { id: 'defi', name: 'DeFi Depths', color: '#6366F1' },
  { id: 'nft', name: 'NFT Nexus', color: '#A855F7' },
  { id: 'security', name: 'Security Citadel', color: '#F97316' },
  { id: 'sentiment', name: 'Sentiment Sea', color: '#F472B6' },
  { id: 'frontier', name: 'Frontier', color: '#D946EF' },
  { id: 'macro', name: 'Macro Meridian', color: '#0EA5E9' },
] as const;
