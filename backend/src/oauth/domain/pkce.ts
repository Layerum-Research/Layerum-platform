import { createHash, timingSafeEqual } from 'node:crypto';

export function verifyPkceS256(codeVerifier: string, codeChallenge: string) {
  const computed = Buffer.from(
    createHash('sha256').update(codeVerifier).digest('base64url'),
  );
  const expected = Buffer.from(codeChallenge);
  return (
    computed.length === expected.length && timingSafeEqual(computed, expected)
  );
}
