import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import {
  cliTokenLookupPrefix,
  hashCliToken,
  isCliToken,
  CLI_TOKEN_PREFIX,
} from '../common/auth/cli-token';
import { parseUserAgent } from '../common/auth/user-agent.parser';
import { OAuthRepository } from './domain/ports';
import {
  ACCESS_TOKEN_TTL_MS,
  AUTHORIZATION_CODE_TTL_MS,
  CLI_CLIENT_ID,
  DEFAULT_TOKEN_NAME,
  MANUAL_REDIRECT_URI,
  isAllowedRedirectUri,
} from './domain/oauth-client';
import { verifyPkceS256 } from './domain/pkce';
import type { AuthorizeDto } from './dto/authorize.dto';
import type { TokenDto } from './dto/token.dto';

function hashAuthorizationCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

function tokenNameFor(userAgent: string | null) {
  const { osName } = parseUserAgent(userAgent);
  return osName === 'Unknown OS'
    ? DEFAULT_TOKEN_NAME
    : `${DEFAULT_TOKEN_NAME} on ${osName}`;
}

@Injectable()
export class OAuthService {
  constructor(private readonly repository: OAuthRepository) {}

  async authorize(userId: string, dto: AuthorizeDto) {
    if (dto.client_id !== CLI_CLIENT_ID) {
      throw new BadRequestException('invalid_client');
    }
    if (!isAllowedRedirectUri(dto.redirect_uri)) {
      throw new BadRequestException('invalid_redirect_uri');
    }

    const code = randomBytes(32).toString('base64url');
    await this.repository.insertAuthorizationCode({
      codeHash: hashAuthorizationCode(code),
      userId,
      clientId: dto.client_id,
      redirectUri: dto.redirect_uri,
      codeChallenge: dto.code_challenge,
      expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
    });

    if (dto.redirect_uri === MANUAL_REDIRECT_URI) {
      return { redirect_url: null, code };
    }

    const redirectUrl = new URL(dto.redirect_uri);
    redirectUrl.searchParams.set('code', code);
    redirectUrl.searchParams.set('state', dto.state);
    return { redirect_url: redirectUrl.toString(), code: null };
  }

  async exchangeToken(dto: TokenDto, userAgent: string | null) {
    const claimed = await this.repository.claimAuthorizationCode(
      hashAuthorizationCode(dto.code),
    );
    if (
      !claimed ||
      claimed.clientId !== dto.client_id ||
      claimed.redirectUri !== dto.redirect_uri ||
      !verifyPkceS256(dto.code_verifier, claimed.codeChallenge)
    ) {
      throw new BadRequestException('invalid_grant');
    }

    const accessToken = `${CLI_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
    await this.repository.insertAccessToken({
      userId: claimed.userId,
      clientId: claimed.clientId,
      name: tokenNameFor(userAgent),
      tokenPrefix: cliTokenLookupPrefix(accessToken),
      tokenHash: hashCliToken(accessToken),
      expiresAt,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer' as const,
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      expires_at: expiresAt.toISOString(),
    };
  }

  async revokeCurrentToken(userId: string, bearer: string | null) {
    if (!bearer || !isCliToken(bearer)) throw new UnauthorizedException();

    const revoked = await this.repository.revokeAccessTokenByHash(
      userId,
      hashCliToken(bearer),
    );
    if (!revoked) throw new UnauthorizedException();
    return { success: true };
  }

  async listTokens(userId: string) {
    return { items: await this.repository.listActiveAccessTokens(userId) };
  }

  async revokeToken(userId: string, id: string) {
    const revoked = await this.repository.revokeAccessTokenById(userId, id);
    if (!revoked) throw new NotFoundException('Token not found');
    return { success: true };
  }
}
