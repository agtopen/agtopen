export type PredictionDirection = 'LONG' | 'SHORT' | 'NEUTRAL';
export type PredictionStatus = 'pending' | 'correct' | 'wrong' | 'expired' | 'cancelled';

export interface Prediction {
  id: string;
  agentId: string;
  market: string;
  direction: PredictionDirection;
  confidence: number;
  targetPrice: number | null;
  currentPrice: number;
  priceRange: [number, number] | null;
  reasoning: string;
  keyCatalysts: string[];
  riskFactors: string[];
  zkProofHash: string | null;
  status: PredictionStatus;
  resolvedAt: Date | null;
  outcome: number | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface PredictionSignal {
  id: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  market: string;
  direction: PredictionDirection;
  confidence: number;
  targetPrice: number | null;
  status: PredictionStatus;
  agreeCount: number;
  disagreeCount: number;
  createdAt: Date;
  expiresAt: Date;
}
