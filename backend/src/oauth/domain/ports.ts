export type AuthorizationCodeDraft = {
  codeHash: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: Date;
};

export type ClaimedAuthorizationCode = {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
};

export type AccessTokenDraft = {
  userId: string;
  clientId: string;
  name: string;
  tokenPrefix: string;
  tokenHash: string;
  expiresAt: Date;
};

export type AccessTokenSummary = {
  id: string;
  name: string;
  client_id: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
};

export abstract class OAuthRepository {
  abstract insertAuthorizationCode(
    draft: AuthorizationCodeDraft,
  ): Promise<void>;
  abstract claimAuthorizationCode(
    codeHash: string,
  ): Promise<ClaimedAuthorizationCode | null>;
  abstract insertAccessToken(draft: AccessTokenDraft): Promise<void>;
  abstract listActiveAccessTokens(
    userId: string,
  ): Promise<AccessTokenSummary[]>;
  abstract revokeAccessTokenById(userId: string, id: string): Promise<boolean>;
  abstract revokeAccessTokenByHash(
    userId: string,
    tokenHash: string,
  ): Promise<boolean>;
}
