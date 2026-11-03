import { Module } from '@nestjs/common';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { OAuthRepository } from './domain/ports';
import { SupabaseOAuthRepository } from './infrastructure/supabase-oauth.repository';

@Module({
  controllers: [OAuthController],
  providers: [
    { provide: OAuthRepository, useClass: SupabaseOAuthRepository },
    OAuthService,
  ],
})
export class OAuthModule {}
