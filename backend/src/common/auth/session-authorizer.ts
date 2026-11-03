import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { VerifiedAccessToken } from './access-token-verifier';
import { SessionAccessCache } from './session-access.cache';
import {
  SessionAccessRepository,
  type SessionAccess,
} from './session-access.repository';
import { parseUserAgent } from './user-agent.parser';

export type SessionClient = {
  ipAddress: string | null;
  userAgent: string | null;
};

@Injectable()
export class SessionAuthorizer {
  constructor(
    private readonly repository: SessionAccessRepository,
    private readonly cache: SessionAccessCache,
  ) {}

  async authorize(token: VerifiedAccessToken, client: SessionClient) {
    const access = await this.resolveAccess(token, client);
    if (!access.userExists) throw new UnauthorizedException();
    if (access.revoked) {
      throw new UnauthorizedException('Session has been revoked');
    }
  }

  private async resolveAccess(
    token: VerifiedAccessToken,
    client: SessionClient,
  ): Promise<SessionAccess> {
    const cached = this.cache.get(token.userId, token.sessionId);
    if (cached) return cached;

    const access = await this.repository.authorize({
      userId: token.userId,
      sessionId: token.sessionId,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
      device: parseUserAgent(client.userAgent),
    });
    this.cache.set(token.userId, token.sessionId, access);
    return access;
  }
}
