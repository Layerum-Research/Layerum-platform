import { UnauthorizedException } from '@nestjs/common';
import type { SupabaseService } from '../../supabase/supabase.service';
import { SupabaseCliTokenAuthenticator } from './supabase-cli-token.authenticator';
import { hashCliToken } from './cli-token';

type Row = {
  id: string;
  user_id: string;
  token_prefix: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
};

const TOKEN = 'lyr_at_0123456789abcdefghijklmnop';
const PREFIX = TOKEN.slice(0, 18);
const FUTURE = new Date(Date.now() + 60_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

function createAuthenticator(rows: Row[]) {
  const update = jest.fn();
  const supabase = {
    admin: {
      from: () => {
        const filters: Array<(row: Row) => boolean> = [];
        const query = {
          select: () => query,
          eq: (column: keyof Row, value: string) => {
            filters.push((row) => row[column] === value);
            return query;
          },
          is: (column: keyof Row, value: null) => {
            filters.push((row) => row[column] === value);
            return query;
          },
          gt: (column: keyof Row, value: string) => {
            filters.push((row) => String(row[column]) > value);
            return query;
          },
          returns: () =>
            Promise.resolve({
              data: rows.filter((row) => filters.every((f) => f(row))),
              error: null,
            }),
          update: (values: unknown) => {
            update(values);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
        return query;
      },
    },
  } as unknown as SupabaseService;
  return { authenticator: new SupabaseCliTokenAuthenticator(supabase), update };
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'token-1',
    user_id: 'user-1',
    token_prefix: PREFIX,
    token_hash: hashCliToken(TOKEN),
    expires_at: FUTURE,
    revoked_at: null,
    ...overrides,
  };
}

describe('SupabaseCliTokenAuthenticator', () => {
  beforeEach(() => {
    process.env.API_KEY_HASH_SECRET = 'test-secret';
  });

  it('returns the user id and records last use for a valid token', async () => {
    const { authenticator, update } = createAuthenticator([row()]);

    await expect(authenticator.authenticate(TOKEN)).resolves.toBe('user-1');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ last_used_at: expect.any(String) }),
    );
  });

  it('rejects a revoked token', async () => {
    const { authenticator } = createAuthenticator([row({ revoked_at: PAST })]);

    await expect(authenticator.authenticate(TOKEN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', async () => {
    const { authenticator } = createAuthenticator([row({ expires_at: PAST })]);

    await expect(authenticator.authenticate(TOKEN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token with the same prefix but a different hash', async () => {
    const { authenticator } = createAuthenticator([row()]);

    await expect(
      authenticator.authenticate(`${PREFIX}different-secret-part`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
