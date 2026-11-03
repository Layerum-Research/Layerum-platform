import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RateLimitService } from './rate-limit.service';
import {
  RATE_LIMIT_POLICY_KEY,
  SKIP_RATE_LIMIT_KEY,
} from './rate-limit.decorator';
import type {
  RateLimitIdentity,
  RateLimitPolicyName,
} from './rate-limit.types';

type JwtPayload = {
  sub?: string;
};

type RateLimitedRequest = Request & {
  params?: Record<string, string | undefined>;
  user?: unknown;
};

function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
    return JSON.parse(
      Buffer.from(padded, 'base64').toString('utf8'),
    ) as JwtPayload;
  } catch {
    return null;
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimits: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = (request.method ?? 'GET').toUpperCase();
    if (method === 'OPTIONS') return true;

    const path = this.normalizePath(request.originalUrl ?? request.url ?? '/');
    const explicitPolicy =
      this.reflector.getAllAndOverride<RateLimitPolicyName>(
        RATE_LIMIT_POLICY_KEY,
        [context.getHandler(), context.getClass()],
      );
    const policy = explicitPolicy ?? this.inferPolicy(path, method);

    await this.rateLimits.enforcePolicy(
      policy,
      this.getIdentity(request, path),
      response,
    );
    return true;
  }

  private getIdentity(
    request: RateLimitedRequest,
    path: string,
  ): RateLimitIdentity {
    const token = this.extractBearerToken(request);
    const payload = token ? decodeJwtPayload(token) : null;
    const body = this.requestBody(request);
    const userId = this.userIdFromRequest(request) ?? payload?.sub ?? null;
    const workspaceId =
      request.params?.workspaceId ??
      this.workspaceFromPath(path) ??
      this.workspaceFromBody(body);
    const emailValue = body.email;
    const email =
      typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : null;
    const internalToken = this.headerValue(request, 'x-internal-token');

    return {
      ip: request.ip ?? null,
      userId,
      workspaceId,
      email,
      internalToken,
      userAgent: this.headerValue(request, 'user-agent'),
    };
  }

  private inferPolicy(path: string, method: string): RateLimitPolicyName {
    if (path === '/auth/signin') return 'auth.signin';
    if (path === '/auth/signup') return 'auth.signup';
    if (path === '/' || path === '/pricing/plans') return 'public.read';
    if (path.startsWith('/contact-requests')) return 'public.forms';
    if (path.startsWith('/feedback-requests')) return 'public.forms';
    if (path.startsWith('/internal')) return 'internal';

    if (path.startsWith('/v1')) {
      if (path === '/v1/query' || path === '/v1/query/debug') {
        return 'v1.query.ip';
      }
      return 'v1.api.ip';
    }

    if (path === '/query' || path === '/query/debug') return 'query.expensive';

    if (path.startsWith('/auth/account')) return 'account.security';
    if (path.startsWith('/auth/sessions')) return 'auth.sessions';
    if (path === '/auth/me' && method === 'GET') return 'auth.profile.read';
    if (path.startsWith('/auth')) return 'auth.profile.write';

    if (path.includes('/api-keys') && method !== 'GET') return 'security.keys';
    if (path.includes('/upload') || path.endsWith('/retry')) return 'upload';
    if (path.includes('/providers') && method !== 'GET') return 'provider.ops';

    if (method === 'GET' || method === 'HEAD') return 'app.read';
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
      return 'app.write';
    }

    return 'default';
  }

  private normalizePath(path: string) {
    const withoutQuery = path.split('?')[0] || '/';
    return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  }

  private workspaceFromPath(path: string) {
    const match = path.match(/^\/workspaces\/([^/]+)/);
    const value = match?.[1];
    if (!value || value === 'overview' || value === 'invites') return null;
    return value;
  }

  private workspaceFromBody(body?: Record<string, unknown>) {
    return typeof body?.workspaceId === 'string' ? body.workspaceId : null;
  }

  private requestBody(request: RateLimitedRequest) {
    const body = request.body as unknown;
    if (!body || typeof body !== 'object') return {};
    return body as Record<string, unknown>;
  }

  private userIdFromRequest(request: RateLimitedRequest) {
    const user = request.user;
    if (!user || typeof user !== 'object') return null;
    const id = (user as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }

  private extractBearerToken(request: RateLimitedRequest) {
    const header = this.headerValue(request, 'authorization');
    const [scheme, token] = header?.split(' ') ?? [];
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }

  private headerValue(request: RateLimitedRequest, name: string) {
    const value = request.headers?.[name.toLowerCase()];
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  }
}
