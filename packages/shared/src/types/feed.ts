export type FeedEventType =
  | 'prediction'
  | 'prediction_resolved'
  | 'alert'
  | 'threat'
  | 'swarm_formed'
  | 'wire_started'
  | 'wire_concluded'
  | 'arena_match'
  | 'territory_flip'
  | 'breeding'
  | 'epiphany'
  | 'milestone'
  | 'season_event';

export interface FeedEvent {
  id: string;
  type: FeedEventType;
  agentId: string | null;
  agentName: string | null;
  agentEmoji: string | null;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}
