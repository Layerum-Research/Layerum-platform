import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { RateLimitService } from './rate-limit.service';

function configService(): ConfigService {
  return {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        nodeEnv: 'test',
        'supabase.jwtSecret': 'test-jwt-secret',
        'supabase.serviceRoleKey': 'test-service-role-key',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
}

describe('RateLimitService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('allows requests when rate limiting is disabled', async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_KV_REST_API_URL;
    delete process.env.UPSTASH_REDIS_KV_REST_API_TOKEN;

    const service = new RateLimitService(configService());

    await expect(
      service.enforcePolicy('auth.signin', {
        ip: '203.0.113.10',
        email: 'user@example.com',
      }),
    ).resolves.toBeUndefined();
  });

  it('fails closed for password auth when Upstash is unavailable', async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.RATE_LIMIT_MODE = 'enforce';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_KV_REST_API_URL;
    delete process.env.UPSTASH_REDIS_KV_REST_API_TOKEN;

    const service = new RateLimitService(configService());

    let thrown: unknown;
    try {
      await service.enforcePolicy('auth.signin', {
        ip: '203.0.113.10',
        email: 'user@example.com',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(429);
  });

  it('fails open for general app requests when Upstash is unavailable', async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.RATE_LIMIT_MODE = 'enforce';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_KV_REST_API_URL;
    delete process.env.UPSTASH_REDIS_KV_REST_API_TOKEN;

    const service = new RateLimitService(configService());

    await expect(
      service.enforcePolicy('app.read', {
        ip: '203.0.113.10',
        userId: 'user-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('accepts prefixed Vercel Upstash Redis REST env names', async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    process.env.UPSTASH_REDIS_KV_REST_API_URL = 'https://example-upstash.test';
    process.env.UPSTASH_REDIS_KV_REST_API_TOKEN = 'write-token';

    const service = new RateLimitService(configService());

    await expect(
      service.enforcePolicy('app.read', {
        ip: '203.0.113.10',
        userId: 'user-1',
      }),
    ).resolves.toBeUndefined();
  });
});
