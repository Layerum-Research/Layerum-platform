import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { createHash, createHmac } from 'node:crypto';
import type { Response } from 'express';
import type {
  RateLimitCheck,
  RateLimitDecision,
  RateLimitIdentity,
  RateLimitPolicyName,
} from './rate-limit.types';
import type { ApiKeyPrincipal } from '../interfaces/api-key-principal.interface';

type RateLimitMode = 'observe' | 'enforce';

type ApiKeyRateLimitContext = {
  path?: string;
  method?: string;
  ip?: string | null;
  userAgent?: string | null;
};

type RedisRestConfig = {
  url: string;
  token: string;
};

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly redis: Redis | null;
  private readonly limiters = new Map<string, Ratelimit>();
  private readonly cache = new Map<string, number>();
  private readonly enabled: boolean;
  private readonly mode: RateLimitMode;
  private readonly timeoutMs: number;
  private readonly analytics: boolean;
  private readonly prefix: string;
  private readonly hashSecret: string;

  constructor(private readonly config: ConfigService) {
    const redisConfig = this.resolveRedisRestConfig();
    this.enabled = this.booleanEnv('RATE_LIMIT_ENABLED', Boolean(redisConfig));
    this.mode =
      (process.env.RATE_LIMIT_MODE ?? 'enforce').trim().toLowerCase() ===
      'observe'
        ? 'observe'
        : 'enforce';
    this.timeoutMs = this.integerEnv('RATE_LIMIT_TIMEOUT_MS', 750);
    this.analytics = this.booleanEnv('RATE_LIMIT_ANALYTICS', false);
    this.prefix =
      process.env.RATE_LIMIT_PREFIX?.trim() ||
      `layerum:${this.config.get<string>('nodeEnv') ?? 'development'}`;
    this.hashSecret =
      process.env.RATE_LIMIT_HASH_SECRET?.trim() ||
      this.config.get<string>('supabase.jwtSecret') ||
      this.config.get<string>('supabase.serviceRoleKey') ||
      'layerum-rate-limit';

    this.redis = redisConfig ? new Redis(redisConfig) : null;

    if (this.enabled && !this.redis) {
      this.logger.warn(
        'Rate limiting is enabled but Upstash Redis REST env vars are missing',
      );
    }
  }

  async enforcePolicy(
    policy: RateLimitPolicyName,
    identity: RateLimitIdentity,
    response?: Response,
  ) {
    const checks = this.getChecks(policy, identity);
    await this.enforceChecks(policy, checks, identity, response);
  }

  async enforceApiKey(
    principal: ApiKeyPrincipal,
    context: ApiKeyRateLimitContext = {},
    response?: Response,
  ) {
    const path = this.normalizePath(context.path ?? '');
    const method = (context.method ?? 'GET').toUpperCase();
    const checks: RateLimitCheck[] = [
      {
        name: 'v1.api_key.rpm',
        scope: 'api-key',
        rawIdentifier: principal.id,
        limit: principal.rpmLimit ?? 120,
        window: '1 m',
      },
    ];

    if (path === '/v1/query' || path === '/v1/query/debug') {
      checks.push(
        {
          name: 'v1.query.api_key.minute',
          scope: 'api-key-query',
          rawIdentifier: principal.id,
          limit: 30,
          window: '1 m',
        },
        {
          name: 'v1.query.workspace.hour',
          scope: 'workspace-query',
          rawIdentifier: principal.workspaceId,
          limit: 120,
          window: '1 h',
        },
      );
    } else if (path.includes('/documents/upload') || path.endsWith('/retry')) {
      checks.push(
        {
          name: 'v1.upload.api_key.minute',
          scope: 'api-key-upload',
          rawIdentifier: principal.id,
          limit: 20,
          window: '1 m',
        },
        {
          name: 'v1.upload.workspace.hour',
          scope: 'workspace-upload',
          rawIdentifier: principal.workspaceId,
          limit: 100,
          window: '1 h',
        },
      );
    } else if (path.includes('/providers') && method !== 'GET') {
      checks.push(
        {
          name: 'v1.provider.api_key.minute',
          scope: 'api-key-provider',
          rawIdentifier: principal.id,
          limit: 20,
          window: '1 m',
        },
        {
          name: 'v1.provider.workspace.hour',
          scope: 'workspace-provider',
          rawIdentifier: principal.workspaceId,
          limit: 60,
          window: '1 h',
        },
      );
    }

    await this.enforceChecks(
      'v1.api-key',
      checks,
      {
        apiKeyId: principal.id,
        workspaceId: principal.workspaceId,
        ip: context.ip,
        userAgent: context.userAgent,
      },
      response,
    );
  }

  async enforceInvalidApiKeyAttempt(
    identity: RateLimitIdentity,
    response?: Response,
  ) {
    await this.enforceChecks(
      'v1.invalid-api-key',
      [
        {
          name: 'v1.invalid_api_key.ip.minute',
          scope: 'ip-invalid-api-key',
          rawIdentifier: identity.ip,
          limit: 30,
          window: '1 m',
        },
      ],
      identity,
      response,
    );
  }

  private async enforceChecks(
    policy: string,
    checks: RateLimitCheck[],
    identity: RateLimitIdentity,
    response?: Response,
  ) {
    const decision = await this.evaluateChecks(policy, checks, identity);
    this.applyHeaders(response, decision);

    if (!decision.allowed) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          policy: decision.policy,
          retryAfterSeconds: this.retryAfterSeconds(decision.reset),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async evaluateChecks(
    policy: string,
    checks: RateLimitCheck[],
    identity: RateLimitIdentity,
  ): Promise<RateLimitDecision> {
    if (!this.enabled) {
      return { allowed: true, policy };
    }

    let headerDecision: RateLimitDecision = { allowed: true, policy };

    for (const check of checks) {
      if (!check.rawIdentifier) continue;

      try {
        const limiter = this.getLimiter(check);
        const identifier = this.identifier(check.scope, check.rawIdentifier);
        const result = await limiter.limit(identifier, {
          ip: identity.ip ?? undefined,
          userAgent: identity.userAgent ?? undefined,
        });
        void result.pending.catch((error) => {
          this.logger.warn(
            `Rate limit pending task failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });

        const decision: RateLimitDecision = {
          allowed: result.success,
          policy,
          checkName: check.name,
          limit: result.limit,
          remaining: result.remaining,
          reset: result.reset,
          reason: result.reason,
        };

        if (
          result.reason === 'timeout' &&
          check.failClosed &&
          this.mode === 'enforce'
        ) {
          return {
            ...decision,
            allowed: false,
            remaining: 0,
            reason: 'timeout',
          };
        }

        if (!result.success) {
          if (this.mode === 'observe') {
            this.logger.warn(
              `Rate limit observed for ${policy}/${check.name}; request allowed in observe mode`,
            );
            return { ...decision, allowed: true, observedOnly: true };
          }
          return decision;
        }

        if (
          typeof decision.remaining === 'number' &&
          (typeof headerDecision.remaining !== 'number' ||
            decision.remaining < headerDecision.remaining)
        ) {
          headerDecision = decision;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Rate limit check failed for ${policy}: ${message}`);
        if (check.failClosed && this.mode === 'enforce') {
          return {
            allowed: false,
            policy,
            checkName: check.name,
            limit: check.limit,
            remaining: 0,
            reset: Date.now() + 60_000,
            reason: 'unavailable',
          };
        }
      }
    }

    return headerDecision;
  }

  private getChecks(
    policy: RateLimitPolicyName,
    identity: RateLimitIdentity,
  ): RateLimitCheck[] {
    const ip = identity.ip;
    const user = identity.userId;
    const workspace = identity.workspaceId;
    const email = identity.email;
    const internalToken = identity.internalToken;

    switch (policy) {
      case 'auth.signin':
        return [
          this.check('auth.signin.ip.minute', 'ip', ip, 10, '1 m', true),
          this.check('auth.signin.ip.hour', 'ip', ip, 50, '1 h', true),
          this.check(
            'auth.signin.email.minute',
            'email',
            email,
            5,
            '1 m',
            true,
          ),
          this.check('auth.signin.email.hour', 'email', email, 20, '1 h', true),
        ];
      case 'auth.signup':
        return [
          this.check('auth.signup.ip.minute', 'ip', ip, 3, '1 m', true),
          this.check('auth.signup.ip.day', 'ip', ip, 20, '1 d', true),
          this.check('auth.signup.email.hour', 'email', email, 3, '1 h', true),
        ];
      case 'auth.password.reset':
        return [
          this.check('auth.password.reset.ip.minute', 'ip', ip, 5, '1 m', true),
          this.check('auth.password.reset.ip.hour', 'ip', ip, 20, '1 h', true),
          this.check(
            'auth.password.reset.email.hour',
            'email',
            email,
            3,
            '1 h',
            true,
          ),
          this.check(
            'auth.password.reset.email.day',
            'email',
            email,
            6,
            '1 d',
            true,
          ),
        ];
      case 'auth.mfa.recovery':
        return [
          this.check('auth.mfa.recovery.ip.minute', 'ip', ip, 5, '1 m', true),
          this.check('auth.mfa.recovery.ip.hour', 'ip', ip, 20, '1 h', true),
          this.check(
            'auth.mfa.recovery.email.hour',
            'email',
            email,
            3,
            '1 h',
            true,
          ),
          this.check(
            'auth.mfa.recovery.email.day',
            'email',
            email,
            6,
            '1 d',
            true,
          ),
        ];
      case 'oauth.token':
        return [
          this.check('oauth.token.ip.minute', 'ip', ip, 10, '1 m', true),
          this.check('oauth.token.ip.hour', 'ip', ip, 50, '1 h', true),
        ];
      case 'public.forms':
        return [
          this.check('public.forms.ip.minute', 'ip', ip, 5, '1 m'),
          this.check('public.forms.ip.day', 'ip', ip, 30, '1 d'),
        ];
      case 'public.read':
        return [this.check('public.read.ip.minute', 'ip', ip, 120, '1 m')];
      case 'auth.profile.read':
        return [
          this.check('auth.profile.user.minute', 'user', user, 120, '1 m'),
          this.check('auth.profile.ip.minute', 'ip', ip, 120, '1 m'),
        ];
      case 'auth.profile.write':
        return [
          this.check('auth.profile.write.user.minute', 'user', user, 30, '1 m'),
          this.check('auth.profile.write.ip.minute', 'ip', ip, 60, '1 m'),
        ];
      case 'auth.sessions':
        return [
          this.check('auth.sessions.user.minute', 'user', user, 30, '1 m'),
          this.check('auth.sessions.ip.minute', 'ip', ip, 60, '1 m'),
        ];
      case 'account.security':
        return [
          this.check('account.security.user.minute', 'user', user, 3, '1 m'),
          this.check('account.security.ip.minute', 'ip', ip, 10, '1 m'),
        ];
      case 'app.read':
        return [
          this.check('app.read.user.minute', 'user', user, 300, '1 m'),
          this.check('app.read.ip.minute', 'ip', ip, 120, '1 m'),
        ];
      case 'app.write':
        return [
          this.check('app.write.user.minute', 'user', user, 60, '1 m'),
          this.check(
            'app.write.workspace.hour',
            'workspace',
            workspace,
            300,
            '1 h',
          ),
          this.check('app.write.ip.minute', 'ip', ip, 60, '1 m'),
        ];
      case 'upload':
        return [
          this.check('upload.user.minute', 'user', user, 20, '1 m'),
          this.check(
            'upload.workspace.hour',
            'workspace',
            workspace,
            100,
            '1 h',
          ),
          this.check('upload.ip.minute', 'ip', ip, 60, '1 m'),
        ];
      case 'query.expensive':
        return [
          this.check('query.user.minute', 'user', user, 30, '1 m'),
          this.check(
            'query.workspace.hour',
            'workspace',
            workspace,
            120,
            '1 h',
          ),
          this.check('query.ip.minute', 'ip', ip, 60, '1 m'),
        ];
      case 'provider.ops':
        return [
          this.check('provider.user.minute', 'user', user, 20, '1 m'),
          this.check(
            'provider.workspace.hour',
            'workspace',
            workspace,
            60,
            '1 h',
          ),
          this.check('provider.ip.minute', 'ip', ip, 60, '1 m'),
        ];
      case 'security.keys':
        return [
          this.check('security.keys.user.minute', 'user', user, 10, '1 m'),
          this.check(
            'security.keys.workspace.hour',
            'workspace',
            workspace,
            30,
            '1 h',
          ),
          this.check('security.keys.ip.minute', 'ip', ip, 60, '1 m'),
        ];
      case 'v1.query.ip':
        return [this.check('v1.query.ip.minute', 'ip', ip, 60, '1 m')];
      case 'v1.api.ip':
        return [this.check('v1.api.ip.minute', 'ip', ip, 300, '1 m')];
      case 'internal':
        return [
          this.check(
            'internal.token.minute',
            'internal-token',
            internalToken,
            600,
            '1 m',
          ),
          this.check('internal.ip.minute', 'ip', ip, 300, '1 m'),
        ];
      case 'default':
      default:
        return [this.check('default.ip.minute', 'ip', ip, 120, '1 m')];
    }
  }

  private check(
    name: string,
    scope: string,
    rawIdentifier: string | null | undefined,
    limit: number,
    window: RateLimitCheck['window'],
    failClosed = false,
  ): RateLimitCheck {
    return { name, scope, rawIdentifier, limit, window, failClosed };
  }

  private getLimiter(check: RateLimitCheck) {
    if (!this.redis) {
      throw new Error('Upstash Redis is not configured');
    }

    const key = `${check.name}:${check.limit}:${check.window}`;
    const existing = this.limiters.get(key);
    if (existing) return existing;

    const limiter = new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.slidingWindow(check.limit, check.window),
      prefix: `${this.prefix}:${check.name}`,
      timeout: this.timeoutMs,
      analytics: this.analytics,
      ephemeralCache: this.cache,
    });
    this.limiters.set(key, limiter);
    return limiter;
  }

  private identifier(scope: string, value: string) {
    return `${scope}:${this.hash(value.trim().toLowerCase())}`;
  }

  private hash(value: string) {
    if (this.hashSecret) {
      return createHmac('sha256', this.hashSecret).update(value).digest('hex');
    }
    return createHash('sha256').update(value).digest('hex');
  }

  private applyHeaders(
    response: Response | undefined,
    decision: RateLimitDecision,
  ) {
    if (!response || typeof decision.limit !== 'number') return;
    response.setHeader('X-RateLimit-Limit', String(decision.limit));
    response.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, decision.remaining ?? 0)),
    );
    if (decision.reset) {
      response.setHeader('X-RateLimit-Reset', String(decision.reset));
      response.setHeader(
        'Retry-After',
        String(this.retryAfterSeconds(decision.reset)),
      );
    }
    if (decision.observedOnly) {
      response.setHeader('X-RateLimit-Observed', 'true');
    }
  }

  private retryAfterSeconds(reset?: number) {
    if (!reset) return 60;
    return Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  }

  private booleanEnv(name: string, fallback: boolean) {
    const raw = process.env[name]?.trim().toLowerCase();
    if (!raw) return fallback;
    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  private integerEnv(name: string, fallback: number) {
    const parsed = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private normalizePath(path: string) {
    const withoutQuery = path.split('?')[0] || '/';
    return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  }

  private resolveRedisRestConfig(): RedisRestConfig | null {
    const url = this.firstEnvValue([
      'UPSTASH_REDIS_REST_URL',
      'KV_REST_API_URL',
      'UPSTASH_REDIS_KV_REST_API_URL',
    ]);
    const token = this.firstEnvValue([
      'UPSTASH_REDIS_REST_TOKEN',
      'KV_REST_API_TOKEN',
      'UPSTASH_REDIS_KV_REST_API_TOKEN',
    ]);

    if (!url || !token) return null;
    return { url, token };
  }

  private firstEnvValue(names: string[]) {
    for (const name of names) {
      const value = process.env[name]?.trim();
      if (value) return value;
    }
    return null;
  }
}
