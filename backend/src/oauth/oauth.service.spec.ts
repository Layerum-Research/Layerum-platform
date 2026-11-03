import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { OAuthService } from './oauth.service';
import type {
  AccessTokenDraft,
  AuthorizationCodeDraft,
  OAuthRepository,
} from './domain/ports';
import { hashCliToken } from '../common/auth/cli-token';

const USER_ID = 'user-1';
const REDIRECT_URI = 'http://127.0.0.1:8080/callback';
const VERIFIER = 'a'.repeat(43);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

function setup() {
  const codes = new Map<string, AuthorizationCodeDraft & { usedAt?: Date }>();
  const tokens: AccessTokenDraft[] = [];
  const revokeAccessTokenByHash = jest.fn().mockResolvedValue(true);
  const revokeAccessTokenById = jest.fn().mockResolvedValue(true);

  const repository = {
    insertAuthorizationCode: jest.fn(async (draft: AuthorizationCodeDraft) => {
      codes.set(draft.codeHash, draft);
    }),
    claimAuthorizationCode: jest.fn(async (codeHash: string) => {
      const row = codes.get(codeHash);
      if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
        return null;
      }
      row.usedAt = new Date();
      return {
        userId: row.userId,
        clientId: row.clientId,
        redirectUri: row.redirectUri,
        codeChallenge: row.codeChallenge,
      };
    }),
    insertAccessToken: jest.fn(async (draft: AccessTokenDraft) => {
      tokens.push(draft);
    }),
    revokeAccessTokenByHash,
    revokeAccessTokenById,
  } as unknown as OAuthRepository;

  return {
    service: new OAuthService(repository),
    codes,
    tokens,
    revokeAccessTokenByHash,
    revokeAccessTokenById,
  };
}

const authorizeDto = {
  client_id: 'layerum-cli',
  redirect_uri: REDIRECT_URI,
  code_challenge: CHALLENGE,
  code_challenge_method: 'S256' as const,
  state: 'state-1234',
};

async function issueCode(service: OAuthService) {
  const { redirect_url } = await service.authorize(USER_ID, authorizeDto);
  return new URL(redirect_url!).searchParams.get('code')!;
}

function tokenDto(code: string, overrides: Record<string, string> = {}) {
  return {
    grant_type: 'authorization_code' as const,
    code,
    code_verifier: VERIFIER,
    client_id: 'layerum-cli',
    redirect_uri: REDIRECT_URI,
    ...overrides,
  };
}

describe('OAuthService', () => {
  beforeEach(() => {
    process.env.API_KEY_HASH_SECRET = 'test-secret';
  });

  describe('authorize', () => {
    it('returns the redirect url with code and state and stores only the hash', async () => {
      const { service, codes } = setup();

      const { redirect_url } = await service.authorize(USER_ID, authorizeDto);

      const url = new URL(redirect_url!);
      const code = url.searchParams.get('code')!;
      expect(`${url.origin}${url.pathname}`).toBe(REDIRECT_URI);
      expect(url.searchParams.get('state')).toBe('state-1234');
      expect(codes.has(code)).toBe(false);
      expect(codes.has(createHash('sha256').update(code).digest('hex'))).toBe(
        true,
      );
    });

    it('returns the code itself for the manual redirect uri', async () => {
      const { service, codes } = setup();

      const result = await service.authorize(USER_ID, {
        ...authorizeDto,
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
      });

      expect(result.redirect_url).toBeNull();
      expect(
        codes.has(createHash('sha256').update(result.code!).digest('hex')),
      ).toBe(true);
    });

    it('rejects a redirect uri that is not an allowed loopback callback', async () => {
      const { service } = setup();

      await expect(
        service.authorize(USER_ID, {
          ...authorizeDto,
          redirect_uri: 'http://127.0.0.1.evil.com:8080/callback',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown client', async () => {
      const { service } = setup();

      await expect(
        service.authorize(USER_ID, { ...authorizeDto, client_id: 'other' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('exchangeToken', () => {
    it('issues an access token when the verifier matches', async () => {
      const { service, tokens } = setup();
      const code = await issueCode(service);

      const result = await service.exchangeToken(tokenDto(code), null);

      expect(result.access_token.startsWith('lyr_at_')).toBe(true);
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(90 * 24 * 60 * 60);
      expect(tokens[0].userId).toBe(USER_ID);
      expect(tokens[0].tokenPrefix).toBe(result.access_token.slice(0, 18));
      expect(tokens[0].tokenHash).toBe(hashCliToken(result.access_token));
      expect(tokens[0].tokenHash).not.toContain(result.access_token);
    });

    it('rejects a wrong verifier and keeps the code consumed', async () => {
      const { service } = setup();
      const code = await issueCode(service);

      await expect(
        service.exchangeToken(
          tokenDto(code, { code_verifier: 'b'.repeat(43) }),
          null,
        ),
      ).rejects.toThrow(new BadRequestException('invalid_grant'));
      await expect(service.exchangeToken(tokenDto(code), null)).rejects.toThrow(
        new BadRequestException('invalid_grant'),
      );
    });

    it('accepts a code only once', async () => {
      const { service } = setup();
      const code = await issueCode(service);

      await service.exchangeToken(tokenDto(code), null);

      await expect(service.exchangeToken(tokenDto(code), null)).rejects.toThrow(
        new BadRequestException('invalid_grant'),
      );
    });

    it('rejects an expired code', async () => {
      const { service, codes } = setup();
      const code = await issueCode(service);
      for (const row of codes.values())
        row.expiresAt = new Date(Date.now() - 1);

      await expect(service.exchangeToken(tokenDto(code), null)).rejects.toThrow(
        new BadRequestException('invalid_grant'),
      );
    });

    it('rejects a mismatched redirect uri or client', async () => {
      const { service } = setup();

      await expect(
        service.exchangeToken(
          tokenDto(await issueCode(service), {
            redirect_uri: 'http://localhost:8080/callback',
          }),
          null,
        ),
      ).rejects.toThrow(new BadRequestException('invalid_grant'));
      await expect(
        service.exchangeToken(
          tokenDto(await issueCode(service), { client_id: 'other' }),
          null,
        ),
      ).rejects.toThrow(new BadRequestException('invalid_grant'));
    });

    it('names the token after the operating system when known', async () => {
      const { service, tokens } = setup();

      await service.exchangeToken(
        tokenDto(await issueCode(service)),
        'layerum-cli/1.0 (Macintosh; Mac OS X)',
      );
      await service.exchangeToken(
        tokenDto(await issueCode(service)),
        'layerum-cli/1.0',
      );

      expect(tokens.map((token) => token.name)).toEqual([
        'Layerum CLI on macOS',
        'Layerum CLI',
      ]);
    });
  });

  describe('revokeCurrentToken', () => {
    it('revokes by the hash of the presented cli token', async () => {
      const { service, revokeAccessTokenByHash } = setup();

      await expect(
        service.revokeCurrentToken(USER_ID, 'lyr_at_abc'),
      ).resolves.toEqual({ success: true });
      expect(revokeAccessTokenByHash).toHaveBeenCalledWith(
        USER_ID,
        hashCliToken('lyr_at_abc'),
      );
    });

    it('rejects a bearer that is not a cli token', async () => {
      const { service, revokeAccessTokenByHash } = setup();

      await expect(
        service.revokeCurrentToken(USER_ID, 'eyJhbGciOi'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(revokeAccessTokenByHash).not.toHaveBeenCalled();
    });

    it('rejects when no active token matched', async () => {
      const { service, revokeAccessTokenByHash } = setup();
      revokeAccessTokenByHash.mockResolvedValue(false);

      await expect(
        service.revokeCurrentToken(USER_ID, 'lyr_at_abc'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('revokeToken', () => {
    it('returns 404 when the token is not the user own', async () => {
      const { service, revokeAccessTokenById } = setup();
      revokeAccessTokenById.mockResolvedValue(false);

      await expect(service.revokeToken(USER_ID, 'id-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
