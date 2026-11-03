import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import {
  AccessTokenVerifier,
  type VerifiedAccessToken,
} from './access-token-verifier';

const SYMMETRIC_ALGORITHMS = ['HS256'];
const ASYMMETRIC_ALGORITHMS = ['ES256', 'RS256'];
const AUDIENCE = 'authenticated';
const CLOCK_TOLERANCE_SECONDS = 30;

type SupabaseClaims = JWTPayload & { session_id?: unknown };

@Injectable()
export class SupabaseAccessTokenVerifier extends AccessTokenVerifier {
  private readonly issuer: string;
  private readonly secret: Uint8Array | null;
  private readonly jwksUrl: URL;
  private jwks: JWTVerifyGetKey | null = null;

  constructor(config: ConfigService) {
    super();
    const supabaseUrl = (config.get<string>('supabase.url') ?? '').replace(
      /\/+$/,
      '',
    );
    const publicUrl = (
      config.get<string>('supabase.publicUrl') || supabaseUrl
    ).replace(/\/+$/, '');
    const jwtSecret = config.get<string>('supabase.jwtSecret') ?? '';
    this.issuer = `${publicUrl}/auth/v1`;
    this.secret = jwtSecret ? new TextEncoder().encode(jwtSecret) : null;
    this.jwksUrl = new URL(
      `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    );
  }

  async verify(token: string): Promise<VerifiedAccessToken> {
    const payload = await this.verifySignature(token);
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new Error('Token subject is missing');
    }
    return {
      userId: payload.sub,
      sessionId:
        typeof payload.session_id === 'string' ? payload.session_id : null,
    };
  }

  private async verifySignature(token: string): Promise<SupabaseClaims> {
    const { alg } = decodeProtectedHeader(token);
    const options = {
      issuer: this.issuer,
      audience: AUDIENCE,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    };

    if (alg && SYMMETRIC_ALGORITHMS.includes(alg)) {
      if (!this.secret) throw new Error('JWT secret is not configured');
      const { payload } = await jwtVerify<SupabaseClaims>(token, this.secret, {
        ...options,
        algorithms: SYMMETRIC_ALGORITHMS,
      });
      return payload;
    }

    if (alg && ASYMMETRIC_ALGORITHMS.includes(alg)) {
      const { payload } = await jwtVerify<SupabaseClaims>(
        token,
        this.getJwks(),
        { ...options, algorithms: ASYMMETRIC_ALGORITHMS },
      );
      return payload;
    }

    throw new Error(`Unsupported token algorithm: ${alg ?? 'none'}`);
  }

  private getJwks() {
    this.jwks ??= createRemoteJWKSet(this.jwksUrl);
    return this.jwks;
  }
}
