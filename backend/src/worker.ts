import { NestFactory } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import { AppModule } from './app.module';
import { IngestionService } from './data-sources/ingestion.service';
import { DataSourcesService } from './data-sources/data-sources.service';
import { UsageService } from './usage/usage.service';
import { NotificationsService } from './notifications/notifications.service';
import { HealthMonitorService } from './system-health/health-monitor.service';
import { ModelCatalogSyncService } from './model-catalog/model-catalog-sync.service';
import {
  INGESTION_JOB_NAME,
  INGESTION_QUEUE_NAME,
  LOGS_RETENTION_JOB_NAME,
  UPLOAD_CLEANUP_JOB_NAME,
  UPLOAD_CLEANUP_QUEUE_NAME,
} from './async-tasks/async-task.constants';

function toInt(value: string | undefined, fallback: number) {
  const raw = (value ?? '').trim();
  // NB: Number('') is 0, so an unset env var must fall back explicitly.
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

async function bootstrapWorker() {
  const redisUrl = (process.env.REDIS_URL ?? '').trim();
  if (!redisUrl) {
    throw new Error('REDIS_URL is required for worker runtime');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const ingestion = app.get(IngestionService);
  const dataSources = app.get(DataSourcesService);
  const usage = app.get(UsageService);
  const notifications = app.get(NotificationsService);
  const healthMonitor = app.get(HealthMonitorService);
  const modelCatalog = app.get(ModelCatalogSyncService);

  const connection = { url: redisUrl };

  const ingestionConcurrency = toInt(process.env.INGEST_WORKER_CONCURRENCY, 2);
  const cleanupIntervalSeconds = toInt(
    process.env.UPLOAD_CLEANUP_INTERVAL_SECONDS,
    600,
  );
  const retentionIntervalSeconds = toInt(
    process.env.LOGS_RETENTION_INTERVAL_SECONDS,
    24 * 60 * 60,
  );
  const healthMonitorIntervalSeconds = toInt(
    process.env.HEALTH_MONITOR_INTERVAL_SECONDS,
    60,
  );
  const modelCatalogSyncIntervalSeconds = toInt(
    process.env.MODEL_CATALOG_SYNC_INTERVAL_SECONDS,
    60 * 60,
  );

  const ingestionWorker = new Worker(
    INGESTION_QUEUE_NAME,
    async (job) => {
      if (job.name !== INGESTION_JOB_NAME) return;
      const dataSourceId = String(job.data?.dataSourceId ?? '');
      if (!dataSourceId) return;
      await ingestion.ingestDataSource(dataSourceId);
    },
    { connection, concurrency: ingestionConcurrency },
  );

  const cleanupWorker = new Worker(
    UPLOAD_CLEANUP_QUEUE_NAME,
    async (job) => {
      if (job.name !== UPLOAD_CLEANUP_JOB_NAME) return;
      await dataSources.processExpiredUploadSessions();
    },
    { connection, concurrency: 1 },
  );

  const cleanupQueue = new Queue(UPLOAD_CLEANUP_QUEUE_NAME, { connection });
  const cleanupTimer = setInterval(() => {
    void cleanupQueue.add(
      UPLOAD_CLEANUP_JOB_NAME,
      { requestedAt: new Date().toISOString() },
      { removeOnComplete: true, removeOnFail: true, attempts: 1 },
    );
  }, cleanupIntervalSeconds * 1000);
  cleanupTimer.unref?.();

  const retentionTimer = setInterval(() => {
    void usage.purgeExpiredLogs().catch((error) => {
      console.error(`[${LOGS_RETENTION_JOB_NAME}] failed`, error);
    });
    void notifications.purgeReadNotifications().catch((error) => {
      console.error('[notifications.retention] failed', error);
    });
  }, retentionIntervalSeconds * 1000);
  retentionTimer.unref?.();

  const healthMonitorTimer = setInterval(() => {
    void healthMonitor.tick().catch((error) => {
      console.error('[health.monitor] failed', error);
    });
  }, healthMonitorIntervalSeconds * 1000);
  healthMonitorTimer.unref?.();

  void modelCatalog.sync();
  const modelCatalogTimer = setInterval(() => {
    void modelCatalog.sync();
  }, modelCatalogSyncIntervalSeconds * 1000);
  modelCatalogTimer.unref?.();

  const shutdown = async () => {
    clearInterval(cleanupTimer);
    clearInterval(retentionTimer);
    clearInterval(healthMonitorTimer);
    clearInterval(modelCatalogTimer);
    await Promise.allSettled([
      ingestionWorker.close(),
      cleanupWorker.close(),
      cleanupQueue.close(),
      app.close(),
    ]);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void bootstrapWorker();
