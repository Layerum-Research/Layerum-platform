import { Global, Module } from '@nestjs/common';
import { AccessTokenVerifier } from './access-token-verifier';
import { SupabaseAccessTokenVerifier } from './supabase-access-token.verifier';
import {
  SessionAccessRepository,
  SupabaseSessionAccessRepository,
} from './session-access.repository';
import { SessionAccessCache } from './session-access.cache';
import { SessionAuthorizer } from './session-authorizer';
import { CliTokenAuthenticator } from './cli-token-authenticator';
import { SupabaseCliTokenAuthenticator } from './supabase-cli-token.authenticator';

@Global()
@Module({
  providers: [
    { provide: AccessTokenVerifier, useClass: SupabaseAccessTokenVerifier },
    {
      provide: SessionAccessRepository,
      useClass: SupabaseSessionAccessRepository,
    },
    {
      provide: CliTokenAuthenticator,
      useClass: SupabaseCliTokenAuthenticator,
    },
    SessionAccessCache,
    SessionAuthorizer,
  ],
  exports: [
    AccessTokenVerifier,
    CliTokenAuthenticator,
    SessionAccessCache,
    SessionAuthorizer,
  ],
})
export class AuthGuardModule {}
