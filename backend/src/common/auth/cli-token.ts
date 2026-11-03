import { createHash } from 'node:crypto';

export const CLI_TOKEN_PREFIX = 'lyr_at_';
const LOOKUP_PREFIX_LENGTH = 18;

export function isCliToken(token: string) {
  return token.startsWith(CLI_TOKEN_PREFIX);
}

export function cliTokenLookupPrefix(token: string) {
  return token.slice(0, LOOKUP_PREFIX_LENGTH);
}

export function hashCliToken(token: string) {
  const secret = (
    process.env.API_KEY_HASH_SECRET ??
    process.env.ENCRYPTION_KEY ??
    ''
  ).trim();
  if (!secret) {
    throw new Error(
      'API_KEY_HASH_SECRET or ENCRYPTION_KEY must be configured for token hashing',
    );
  }
  return createHash('sha256').update(`${secret}:${token}`).digest('hex');
}
