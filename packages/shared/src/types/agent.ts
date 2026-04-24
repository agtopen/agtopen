export type AgentTier = 'genesis' | 'foundation' | 'specialist' | 'advanced' | 'community';
export type AgentType = 'research' | 'analysis' | 'crawler' | 'prediction' | 'connector' | 'security' | 'creative' | 'risk' | 'forensics' | 'quantitative' | 'geopolitical' | 'psychology' | 'macro' | 'frontier' | 'microstructure' | 'temporal' | 'verification' | 'emergent';
export type AgentStatus = 'active' | 'paused' | 'dormant';

export interface AgentPersonality {
  temperature: number;
  maxTokens: number;
  style: string;
  voiceDescription: string;
  systemPrompt: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  type: AgentType;
  tier: AgentTier;
  generation: number;
  color: string;
  description: string;
  expertise: string[];
  personality: AgentPersonality;
}

export interface Agent extends AgentConfig {
  accuracy: number;
  reputation: number;
  energy: number;
  status: AgentStatus;
  totalPredictions: number;
  correctPredictions: number;
  totalStaked: number;
  stakerCount: number;
}

export interface AgentStats {
  agentId: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracyPct: number;
  totalStaked: number;
  stakerCount: number;
  dailyEarnings: number;
}
