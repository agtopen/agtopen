export type UserTier = 'free' | 'pro' | 'sovereign';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  walletAddress: string | null;
  tier: UserTier;
  atomsBalance: number;
  reputation: number;
  createdAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface Session {
  userId: string;
  email: string;
  tier: UserTier;
}

export interface OtpResponse {
  ok: boolean;
  message: string;
}

export interface AuthResponse {
  ok: boolean;
  tokens: AuthTokens;
  user: {
    id: string;
    email: string;
    tier: UserTier;
    atomsBalance: number;
    displayName: string | null;
  };
}
