import { Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { SupabaseService } from '../../supabase/supabase.service';
import { CliTokenAuthenticator } from './cli-token-authenticator';
import { cliTokenLookupPrefix, hashCliToken } from './cli-token';

type AccessTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
};

function hashesMatch(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

@Injectable()
export class SupabaseCliTokenAuthenticator extends CliTokenAuthenticator {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async authenticate(token: string) {
    const { data, error } = await this.supabase.admin
      .from('oauth_access_tokens')
      .select('id, user_id, token_hash')
      .eq('token_prefix', cliTokenLookupPrefix(token))
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .returns<AccessTokenRow[]>();
    if (error) throw new Error(error.message);

    const hash = hashCliToken(token);
    const match = (data ?? []).find((row) => hashesMatch(row.token_hash, hash));
    if (!match) throw new UnauthorizedException();

    const { error: touchError } = await this.supabase.admin
      .from('oauth_access_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', match.id);
    if (touchError) throw new Error(touchError.message);

    return match.user_id;
  }
}
