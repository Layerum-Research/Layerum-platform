import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  OAuthRepository,
  type AccessTokenDraft,
  type AccessTokenSummary,
  type AuthorizationCodeDraft,
  type ClaimedAuthorizationCode,
} from '../domain/ports';

const SUMMARY_COLUMNS =
  'id, name, client_id, created_at, last_used_at, expires_at';

type ClaimedRow = {
  user_id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
};

@Injectable()
export class SupabaseOAuthRepository extends OAuthRepository {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async insertAuthorizationCode(draft: AuthorizationCodeDraft) {
    const { error } = await this.supabase.admin
      .from('oauth_authorization_codes')
      .insert({
        code_hash: draft.codeHash,
        user_id: draft.userId,
        client_id: draft.clientId,
        redirect_uri: draft.redirectUri,
        code_challenge: draft.codeChallenge,
        expires_at: draft.expiresAt.toISOString(),
      });
    if (error) throw new Error(error.message);
  }

  async claimAuthorizationCode(
    codeHash: string,
  ): Promise<ClaimedAuthorizationCode | null> {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase.admin
      .from('oauth_authorization_codes')
      .update({ used_at: now })
      .eq('code_hash', codeHash)
      .is('used_at', null)
      .gt('expires_at', now)
      .select('user_id, client_id, redirect_uri, code_challenge')
      .maybeSingle<ClaimedRow>();
    if (error) throw new Error(error.message);
    if (!data) return null;

    return {
      userId: data.user_id,
      clientId: data.client_id,
      redirectUri: data.redirect_uri,
      codeChallenge: data.code_challenge,
    };
  }

  async insertAccessToken(draft: AccessTokenDraft) {
    const { error } = await this.supabase.admin
      .from('oauth_access_tokens')
      .insert({
        user_id: draft.userId,
        client_id: draft.clientId,
        name: draft.name,
        token_prefix: draft.tokenPrefix,
        token_hash: draft.tokenHash,
        expires_at: draft.expiresAt.toISOString(),
      });
    if (error) throw new Error(error.message);
  }

  async listActiveAccessTokens(userId: string) {
    const { data, error } = await this.supabase.admin
      .from('oauth_access_tokens')
      .select(SUMMARY_COLUMNS)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .returns<AccessTokenSummary[]>();
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async revokeAccessTokenById(userId: string, id: string) {
    return this.revoke(userId, 'id', id);
  }

  async revokeAccessTokenByHash(userId: string, tokenHash: string) {
    return this.revoke(userId, 'token_hash', tokenHash);
  }

  private async revoke(
    userId: string,
    column: 'id' | 'token_hash',
    value: string,
  ) {
    const { data, error } = await this.supabase.admin
      .from('oauth_access_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq(column, value)
      .is('revoked_at', null)
      .select('id');
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  }
}
