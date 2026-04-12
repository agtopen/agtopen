// === CONSULT (User ↔ Agent) ===

export interface ConsultMessage {
  id: string;
  conversationId: string;
  agentId: string;
  role: 'user' | 'agent';
  content: string;
  createdAt: Date;
}

export interface ConsultConversation {
  id: string;
  userId: string;
  agentId: string;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
}

// === AGORA (User Forum) ===

export type AgoraAnchor = 'event' | 'prediction' | 'agent' | 'swarm' | 'dao_proposal' | 'general';
export type AgoraThreadStatus = 'active' | 'archived' | 'locked';

export interface AgoraThread {
  id: string;
  anchor: AgoraAnchor;
  anchorId: string | null;
  title: string;
  status: AgoraThreadStatus;
  messagesCount: number;
  participantsCount: number;
  createdBy: string;
  lastMessageAt: Date;
  createdAt: Date;
}

export interface AgoraMessage {
  id: string;
  threadId: string;
  userId: string;
  userDisplayName: string;
  content: string;
  reactions: Record<string, number>;
  createdAt: Date;
}

// === WIRE (Agent ↔ Agent) ===

export type WireTrigger = 'threat_alert' | 'swarm_milestone' | 'complementary_data' | 'scheduled_review' | 'dao_proposal';
export type WireStatus = 'active' | 'concluded' | 'expired';

export interface WireConversation {
  id: string;
  trigger: WireTrigger;
  topic: string;
  agentIds: string[];
  status: WireStatus;
  messageCount: number;
  priority: 'critical' | 'normal' | 'low';
  createdAt: Date;
  concludedAt: Date | null;
}

export interface WireMessage {
  id: string;
  conversationId: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  content: string;
  isSpecialCommand: boolean;
  createdAt: Date;
}
