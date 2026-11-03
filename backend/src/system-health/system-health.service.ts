import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { SupabaseService } from '../supabase/supabase.service';
import { VectorService } from '../vector/vector.service';
import type {
  HealthComponent,
  HealthComponentName,
} from './system-health.types';

const DB_DEGRADED_LATENCY_MS = 1_500;
const QDRANT_DEGRADED_LATENCY_MS = 1_500;
const REDIS_DEGRADED_LATENCY_MS = 800;

@Injectable()
export class SystemHealthService implements OnModuleDestroy {
  private redisClient: Redis | null = null;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly vector: VectorService,
    private readonly config: ConfigService,
  ) {}

  async onModuleDestroy() {
    await this.redisClient?.quit().catch(() => undefined);
  }

  checkBackend(): HealthComponent {
    return {
      name: 'backend',
      status: 'up',
      latencyMs: 0,
      message: 'Service is running',
    };
  }

  checkDatabase(): Promise<HealthComponent> {
    return this.measure('database', DB_DEGRADED_LATENCY_MS, async () => {
      const { error } = await this.supabase.admin
        .from('workspaces')
        .select('id')
        .limit(1);
      if (error) throw new Error(error.message);
    });
  }

  checkQdrant(): Promise<HealthComponent> {
    return this.measure('qdrant', QDRANT_DEGRADED_LATENCY_MS, async () => {
      await this.vector.getCollections();
    });
  }

  async checkRedis(): Promise<HealthComponent> {
    const client = this.getRedisClient();
    if (!client) {
      return {
        name: 'redis',
        status: 'not_configured',
        latencyMs: null,
        message: 'REDIS_URL is not configured',
      };
    }

    return this.measure('redis', REDIS_DEGRADED_LATENCY_MS, async () => {
      if (client.status === 'wait' || client.status === 'end') {
        await client.connect();
      }
      const pong = await client.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected ping response: ${String(pong)}`);
      }
    });
  }

  private async measure(
    name: HealthComponentName,
    degradedLatencyMs: number,
    probe: () => Promise<void>,
  ): Promise<HealthComponent> {
    const startedAt = Date.now();
    try {
      await probe();
      const latencyMs = Date.now() - startedAt;
      if (latencyMs > degradedLatencyMs) {
        return {
          name,
          status: 'degraded',
          latencyMs,
          message: `High ${name} latency`,
        };
      }
      return { name, status: 'up', latencyMs, message: 'Connection OK' };
    } catch (error) {
      return {
        name,
        status: 'down',
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private getRedisClient() {
    if (this.redisClient) return this.redisClient;
    const explicitRedisUrl = process.env.REDIS_URL;
    if (!explicitRedisUrl) return null;

    const redisUrl = this.config.get<string>('redis.url') ?? explicitRedisUrl;
    this.redisClient = new Redis(redisUrl, {
      lazyConnect: true,
      enableReadyCheck: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
    });
    this.redisClient.on('error', () => undefined);
    return this.redisClient;
  }
}
