import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import {
  AsyncTaskMode,
  INGESTION_JOB_NAME,
  INGESTION_QUEUE_NAME,
} from './async-task.constants';

@Injectable()
export class AsyncTasksService {
  private readonly logger = new Logger(AsyncTasksService.name);
  private ingestionQueue: Queue | null = null;
  private readonly ingestionJobOptions: JobsOptions = {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: true,
    removeOnFail: false,
  };

  constructor(
    private readonly config: ConfigService,
  ) {}

  async dispatchIngestion(dataSourceId: string) {
    const mode = this.resolveMode();
    if (mode === 'gateway') {
      await this.enqueueIngestionViaGateway(dataSourceId);
      return true;
    }
    return this.enqueueIngestionLocal(dataSourceId, mode);
  }

  async enqueueIngestionLocal(
    dataSourceId: string,
    modeOverride?: Exclude<AsyncTaskMode, 'auto' | 'gateway'>,
  ) {
    const mode = modeOverride ?? this.resolveLocalMode();
    if (mode === 'queue') {
      const queue = this.getIngestionQueue();
      await queue.add(
        INGESTION_JOB_NAME,
        {
          dataSourceId,
          enqueuedAt: new Date().toISOString(),
        },
        this.ingestionJobOptions,
      );
      return true;
    }
    return false;
  }

  private resolveMode(): Exclude<AsyncTaskMode, 'auto'> {
    const raw = (process.env.ASYNC_TASKS_MODE ?? 'auto').trim().toLowerCase();
    const mode = (['auto', 'inline', 'queue', 'gateway'] as const).includes(
      raw as AsyncTaskMode,
    )
      ? (raw as AsyncTaskMode)
      : 'auto';

    if (mode !== 'auto') return mode;
    if (this.hasGatewayConfigured()) return 'gateway';
    if (this.hasRedisConfigured()) return 'queue';
    return 'inline';
  }

  private resolveLocalMode(): 'inline' | 'queue' {
    const mode = this.resolveMode();
    if (mode === 'gateway') {
      if (this.hasRedisConfigured()) return 'queue';
      return 'inline';
    }
    return mode;
  }

  private hasRedisConfigured() {
    return Boolean((process.env.REDIS_URL ?? '').trim());
  }

  private hasGatewayConfigured() {
    return Boolean((process.env.INTERNAL_GATEWAY_URL ?? '').trim());
  }

  private getRedisConnection() {
    const redisUrl = process.env.REDIS_URL ?? this.config.get<string>('redis.url') ?? '';
    if (!redisUrl) {
      throw new Error('REDIS_URL is required for queue mode');
    }
    return { url: redisUrl };
  }

  private getIngestionQueue() {
    if (this.ingestionQueue) return this.ingestionQueue;
    this.ingestionQueue = new Queue(INGESTION_QUEUE_NAME, {
      connection: this.getRedisConnection(),
      defaultJobOptions: this.ingestionJobOptions,
    });
    return this.ingestionQueue;
  }

  private async enqueueIngestionViaGateway(dataSourceId: string) {
    const baseUrl = (process.env.INTERNAL_GATEWAY_URL ?? '').trim().replace(/\/+$/, '');
    const token = (process.env.INTERNAL_GATEWAY_TOKEN ?? '').trim();
    if (!baseUrl || !token) {
      throw new Error(
        'INTERNAL_GATEWAY_URL and INTERNAL_GATEWAY_TOKEN are required for gateway mode',
      );
    }

    const res = await fetch(`${baseUrl}/internal/jobs/ingestion`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-token': token,
      },
      body: JSON.stringify({ dataSourceId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Gateway enqueue failed (${res.status}): ${text}`);
      throw new Error(`Gateway enqueue failed with status ${res.status}`);
    }
  }
}
