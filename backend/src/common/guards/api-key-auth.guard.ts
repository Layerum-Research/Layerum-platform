import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { WorkspaceApiKeysService } from '../../workspace-api-keys/workspace-api-keys.service';
import type { ApiKeyPrincipal } from '../interfaces/api-key-principal.interface';
import { RateLimitService } from '../rate-limit/rate-limit.service';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly apiKeys: WorkspaceApiKeysService,
    private readonly rateLimits: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { apiKeyPrincipal?: ApiKeyPrincipal }>();
    const response = context.switchToHttp().getResponse<Response>();

    const authHeader = request.headers.authorization;
    if (!authHeader) {
      await this.rateLimits.enforceInvalidApiKeyAttempt(
        this.identityFromRequest(request),
        response,
      );
      throw new UnauthorizedException();
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      await this.rateLimits.enforceInvalidApiKeyAttempt(
        this.identityFromRequest(request),
        response,
      );
      throw new UnauthorizedException();
    }

    if (!token.startsWith('lyr_wk_')) {
      await this.rateLimits.enforceInvalidApiKeyAttempt(
        this.identityFromRequest(request),
        response,
      );
      throw new UnauthorizedException('Invalid API key format');
    }

    let principal: ApiKeyPrincipal;
    try {
      principal = await this.apiKeys.authenticate(token);
    } catch (error) {
      await this.rateLimits.enforceInvalidApiKeyAttempt(
        this.identityFromRequest(request),
        response,
      );
      throw error;
    }

    await this.rateLimits.enforceApiKey(
      principal,
      {
        path: request.originalUrl ?? request.url,
        method: request.method,
        ip: request.ip,
        userAgent: this.headerValue(request, 'user-agent'),
      },
      response,
    );
    await this.apiKeys.assertRateLimits(principal);

    request.apiKeyPrincipal = principal;
    return true;
  }

  private identityFromRequest(request: Request) {
    return {
      ip: request.ip ?? null,
      userAgent: this.headerValue(request, 'user-agent'),
    };
  }

  private headerValue(request: Request, name: string) {
    const value = request.headers[name.toLowerCase()];
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  }
}
