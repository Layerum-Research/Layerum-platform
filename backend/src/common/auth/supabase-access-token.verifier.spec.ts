import type { ConfigService } from '@nestjs/config';
import { SignJWT, UnsecuredJWT } from 'jose';
import { SupabaseAccessTokenVerifier } from './supabase-access-token.verifier';

const SUPABASE_URL = 'https://project.supabase.co';
const SECRET = 'test-secret-with-enough-length-for-hs256';

function createVerifier(publicUrl?: string) {
  const values: Record<string, string> = {
    'supabase.url': SUPABASE_URL,
    'supabase.jwtSecret': SECRET,
    ...(publicUrl ? { 'supabase.publicUrl': publicUrl } : {}),
  };
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  return new SupabaseAccessTokenVerifier(config);
}

function signToken(overrides: { audience?: string; issuer?: string } = {}) {
  return new SignJWT({ session_id: 'session-1' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('user-1')
    .setAudience(overrides.audience ?? 'authenticated')
    .setIssuer(overrides.issuer ?? `${SUPABASE_URL}/auth/v1`)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRET));
}

describe('SupabaseAccessTokenVerifier', () => {
  it('verifies a valid HS256 token', async () => {
    await expect(createVerifier().verify(await signToken())).resolves.toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
    });
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await signToken({ audience: 'anon' });
    await expect(createVerifier().verify(token)).rejects.toThrow();
  });

  it('rejects a token from another issuer', async () => {
    const token = await signToken({ issuer: 'https://evil.example/auth/v1' });
    await expect(createVerifier().verify(token)).rejects.toThrow();
  });

  it('uses the public URL as issuer when configured', async () => {
    const publicUrl = 'http://localhost:8000';
    const verifier = createVerifier(publicUrl);
    const token = await signToken({ issuer: `${publicUrl}/auth/v1` });
    await expect(verifier.verify(token)).resolves.toMatchObject({ userId: 'user-1' });
    await expect(verifier.verify(await signToken())).rejects.toThrow();
  });

  it('rejects unsigned tokens', async () => {
    const token = new UnsecuredJWT({ sub: 'user-1' })
      .setAudience('authenticated')
      .setIssuer(`${SUPABASE_URL}/auth/v1`)
      .encode();
    await expect(createVerifier().verify(token)).rejects.toThrow();
  });
});
