import type { Duration } from '@upstash/ratelimit';

export type RateLimitPolicyName =
  | 'auth.signin'
  | 'auth.signup'
  | 'auth.password.reset'
  | 'auth.mfa.recovery'
  | 'oauth.token'
  | 'public.forms'
  | 'public.read'
  | 'auth.profile.read'
  | 'auth.profile.write'
  | 'auth.sessions'
  | 'account.security'
  | 'app.read'
  | 'app.write'
  | 'upload'
  | 'query.expensive'
  | 'provider.ops'
  | 'security.keys'
  | 'v1.api.ip'
  | 'v1.query.ip'
  | 'internal'
  | 'default';

export type RateLimitIdentity = {
  ip?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  email?: string | null;
  apiKeyId?: string | null;
  internalToken?: string | null;
  userAgent?: string | null;
};

export type RateLimitCheck = {
  name: string;
  scope: string;
  rawIdentifier?: string | null;
  limit: number;
  window: Duration;
  failClosed?: boolean;
};

export type RateLimitDecision = {
  allowed: boolean;
  observedOnly?: boolean;
  policy: string;
  checkName?: string;
  limit?: number;
  remaining?: number;
  reset?: number;
  reason?: string;
};
