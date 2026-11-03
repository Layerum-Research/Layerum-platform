import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from '../decorators/current-user.decorator';
import {
  AccessTokenVerifier,
  type VerifiedAccessToken,
} from '../auth/access-token-verifier';
import { CliTokenAuthenticator } from '../auth/cli-token-authenticator';
import { isCliToken } from '../auth/cli-token';
import { ALLOW_CLI_TOKEN_KEY } from '../decorators/allow-cli-token.decorator';
import { SessionAuthorizer } from '../auth/session-authorizer';
import { extractUserAgent } from '../auth/user-agent.parser';

type AuthenticatedRequest = Request & { user?: AuthUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly verifier: AccessTokenVerifier,
    private readonly authorizer: SessionAuthorizer,
    private readonly cliTokens: CliTokenAuthenticator,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const bearer = this.extractBearerToken(request);

    if (isCliToken(bearer)) {
      const allowed = this.reflector.getAllAndOverride<boolean>(
        ALLOW_CLI_TOKEN_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!allowed) throw new UnauthorizedException();

      request.user = {
        id: await this.cliTokens.authenticate(bearer),
        session_id: null,
      };
      return true;
    }

    const token = await this.verifyToken(bearer);

    await this.authorizer.authorize(token, {
      ipAddress: request.ip ?? null,
      userAgent: extractUserAgent(request.headers),
    });

    request.user = { id: token.userId, session_id: token.sessionId };
    return true;
  }

  private extractBearerToken(request: AuthenticatedRequest) {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException();
    }
    return token;
  }

  private async verifyToken(token: string): Promise<VerifiedAccessToken> {
    try {
      return await this.verifier.verify(token);
    } catch {
      throw new UnauthorizedException();
    }
  }
}
