import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis as UpstashRedis } from '@upstash/redis';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { SystemHealthService } from '../system-health/system-health.service';
import type {
  HealthComponent,
  HealthComponentName,
} from '../system-health/system-health.types';
import { DataEncryptionService } from '../workspace-encryption/data-encryption.service';

type DashboardHealthResult = {
  percent: number;
  components: HealthComponent[];
};

const HEALTH_COMPONENT_WEIGHTS: Record<HealthComponentName, number> = {
  backend: 20,
  database: 35,
  qdrant: 35,
  redis: 10,
};

type DashboardGranularity = 'hour' | 'day' | 'week';

type DashboardAnalyticsResponse = {
  days: number;
  granularity: DashboardGranularity;
  kpis: {
    totalQueries: number;
    totalDocuments: number;
    totalEntities: number;
    totalTokens: number;
  };
  performance: {
    avgLatencyMs: number;
    errorRatePct: number;
    throttledPct: number;
    peakLoadPerMin: number;
  };
  trend: Array<{ bucketStart: string; queries: number; tokens: number }>;
  timeseries: {
    latency: Array<{
      bucketStart: string;
      avgLatencyMs: number | null;
      sampleCount: number;
    }>;
    errorRate: Array<{
      bucketStart: string;
      errorRatePct: number | null;
      totalAttempts: number;
      failedAttempts: number;
    }>;
    throttledRate: Array<{
      bucketStart: string;
      throttledPct: number | null;
      failedAttempts: number;
      throttledAttempts: number;
    }>;
  };
  systemHealth: DashboardHealthResult;
  recentActivity: DashboardAuditLogRow[];
};

type QueryBucketRow = {
  bucket_start: string;
  queries: number;
  tokens: number;
  latency_sum: number;
  latency_count: number;
  failures: number;
  throttled: number;
};

type UsageSummaryJobRow = {
  id: string;
  status: string;
  created_at: string;
};

type QueryLogStorageRow = {
  id: string;
  query_text: string;
  query_text_ciphertext: string | null;
  query_text_iv: string | null;
  query_text_tag: string | null;
  query_text_enc_version: number | null;
  answer_text: string | null;
  answer_text_ciphertext: string | null;
  answer_text_iv: string | null;
  answer_text_tag: string | null;
  answer_text_enc_version: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  success: boolean;
  created_at: string;
};

type DashboardAuditLogRow = {
  id: string;
  created_at: string;
  action: string;
  resource: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
};

type QueryBucketStats = {
  bucketStart: string;
  queries: number;
  tokens: number;
  latencySumMs: number;
  latencySampleCount: number;
};

type AttemptBucketStats = {
  bucketStart: string;
  totalAttempts: number;
  failedAttempts: number;
  throttledAttempts: number;
};

@Injectable()
export class UsageService {
  private static readonly DEFAULT_DAYS = 7;
  private static readonly ALLOWED_DAYS = new Set([1, 7, 30, 90]);
  private static readonly SYSTEM_HEALTH_TTL_MS = 15_000;
  private static readonly DASHBOARD_CACHE_TTL_S = 60;

  private readonly logger = new Logger(UsageService.name);
  private readonly cache: UpstashRedis | null;

  private systemHealthCache: {
    expiresAt: number;
    value: DashboardHealthResult;
  } | null = null;
  private systemHealthInFlight: Promise<DashboardHealthResult> | null = null;

  constructor(
    private supabase: SupabaseService,
    private workspacesService: WorkspacesService,
    private readonly systemHealth: SystemHealthService,
    private readonly encryption: DataEncryptionService,
    private readonly config: ConfigService,
  ) {
    this.cache = UsageService.resolveCacheRedis();
  }

  private static resolveCacheRedis(): UpstashRedis | null {
    const firstEnv = (candidates: string[]) => {
      for (const name of candidates) {
        const value = process.env[name]?.trim();
        if (value) return value;
      }
      return null;
    };
    const url = firstEnv([
      'UPSTASH_REDIS_REST_URL',
      'KV_REST_API_URL',
      'UPSTASH_REDIS_KV_REST_API_URL',
    ]);
    const token = firstEnv([
      'UPSTASH_REDIS_REST_TOKEN',
      'KV_REST_API_TOKEN',
      'UPSTASH_REDIS_KV_REST_API_TOKEN',
    ]);
    if (!url || !token) return null;
    return new UpstashRedis({ url, token });
  }

  private dashboardCacheKey(workspaceId: string, days: number) {
    const env = this.config.get<string>('nodeEnv') ?? 'development';
    return `layerum:${env}:usage:dashboard:${workspaceId}:${days}`;
  }

  async getSummary(workspaceId: string, userId: string) {
    await this.workspacesService.assertOwner(workspaceId, userId);

    const [stats, docs, chunks, jobs] = await Promise.all([
      this.supabase.admin.rpc('workspace_query_summary', {
        p_workspace_id: workspaceId,
      }),
      this.supabase.admin
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId),
      this.supabase.admin
        .from('document_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId),
      this.supabase.admin
        .from('ingestion_jobs')
        .select('id, status, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(10)
        .returns<UsageSummaryJobRow[]>(),
    ]);

    if (stats.error) throw new Error(stats.error.message);
    const totals = (stats.data?.[0] ?? null) as {
      total_queries: number;
      total_tokens: number;
    } | null;

    return {
      totalQueries: Number(totals?.total_queries ?? 0),
      totalTokens: Number(totals?.total_tokens ?? 0),
      totalDocuments: docs.count ?? 0,
      totalChunks: chunks.count ?? 0,
      recentJobs: jobs.data ?? [],
    };
  }

  async getQueryLogs(workspaceId: string, userId: string, limit = 50) {
    await this.workspacesService.assertOwner(workspaceId, userId);

    const { data } = await this.supabase.admin
      .from('query_logs')
      .select(
        'id, query_text, query_text_ciphertext, query_text_iv, query_text_tag, query_text_enc_version, answer_text, answer_text_ciphertext, answer_text_iv, answer_text_tag, answer_text_enc_version, total_tokens, latency_ms, success, created_at',
      )
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    const rows = (data ?? []) as QueryLogStorageRow[];
    return Promise.all(
      rows.map((row) => this.decodeQueryLogRow(workspaceId, row)),
    );
  }

  async getDashboardAnalytics(
    workspaceId: string,
    userId: string,
    requestedDays?: number,
  ) {
    await this.workspacesService.assertOwner(workspaceId, userId);

    const days = this.normalizeDays(requestedDays);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sinceIso = since.toISOString();
    const granularity = this.resolveGranularity(days);
    const bucketStarts = this.buildBucketStarts(granularity, days);

    const cacheKey = this.dashboardCacheKey(workspaceId, days);
    const cached = await this.readDashboardCache(cacheKey);
    if (cached) return cached;

    const canReadAudit = await this.workspacesService.hasPermission(
      workspaceId,
      userId,
      'audit.read',
    );

    const recentActivityPromise = canReadAudit
      ? this.supabase.admin
          .from('audit_logs')
          .select('id, created_at, action, resource, resource_id, metadata')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [] as DashboardAuditLogRow[], error: null });

    // Aggregates are computed in SQL (workspace_query_buckets / workspace_peak_load).
    // Every query — success or failure — leaves exactly one query_logs row,
    // so failures/throttled come from the same bucket set, no audit_logs scan.
    const [buckets, peak, docs, entities, recentActivity, systemHealth] =
      await Promise.all([
        this.supabase.admin.rpc('workspace_query_buckets', {
          p_workspace_id: workspaceId,
          p_since: sinceIso,
          p_granularity: granularity,
        }),
        this.supabase.admin.rpc('workspace_peak_load', {
          p_workspace_id: workspaceId,
          p_since: sinceIso,
        }),
        this.supabase.admin
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId),
        this.supabase.admin
          .from('entities')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId),
        recentActivityPromise,
        this.getSystemHealth(),
      ]);

    if (buckets.error) throw new Error(buckets.error.message);
    if (peak.error) throw new Error(peak.error.message);
    if (docs.error) throw new Error(docs.error.message);
    if (entities.error) throw new Error(entities.error.message);
    if (recentActivity.error) throw new Error(recentActivity.error.message);

    const queryBucketMap = this.initQueryBucketMap(bucketStarts);
    const attemptBucketMap = this.initAttemptBucketMap(bucketStarts);
    let totalQueries = 0;
    let totalTokens = 0;
    let latencySum = 0;
    let latencySampleCount = 0;
    let failedAttempts = 0;
    let throttledAttempts = 0;

    for (const row of (buckets.data ?? []) as QueryBucketRow[]) {
      const rowMs = Date.parse(row.bucket_start);
      if (Number.isNaN(rowMs)) continue;
      const bucketStartIso = new Date(
        this.floorToGranularity(rowMs, granularity),
      ).toISOString();
      const bucket = queryBucketMap.get(bucketStartIso);
      const attemptBucket = attemptBucketMap.get(bucketStartIso);
      if (!bucket || !attemptBucket) continue;

      const queries = Number(row.queries ?? 0);
      const tokens = Number(row.tokens ?? 0);
      const latencyRowSum = Number(row.latency_sum ?? 0);
      const latencyRowCount = Number(row.latency_count ?? 0);
      const failures = Number(row.failures ?? 0);
      const throttled = Number(row.throttled ?? 0);

      bucket.queries += queries;
      bucket.tokens += tokens;
      bucket.latencySumMs += latencyRowSum;
      bucket.latencySampleCount += latencyRowCount;
      attemptBucket.totalAttempts += queries;
      attemptBucket.failedAttempts += failures;
      attemptBucket.throttledAttempts += throttled;

      totalQueries += queries;
      totalTokens += tokens;
      latencySum += latencyRowSum;
      latencySampleCount += latencyRowCount;
      failedAttempts += failures;
      throttledAttempts += throttled;
    }

    const avgLatencyMs =
      latencySampleCount > 0 ? this.round2(latencySum / latencySampleCount) : 0;
    const peakLoadPerMin = Number(peak.data?.[0]?.peak_per_min ?? 0);

    const trend = bucketStarts.map((bucketStartMs) => {
      const bucketStart = new Date(bucketStartMs).toISOString();
      const bucket = queryBucketMap.get(bucketStart);
      return {
        bucketStart,
        queries: bucket?.queries ?? 0,
        tokens: bucket?.tokens ?? 0,
      };
    });

    const errorRatePct =
      totalQueries > 0 ? this.round2((failedAttempts / totalQueries) * 100) : 0;
    const throttledPct =
      failedAttempts > 0
        ? this.round2((throttledAttempts / failedAttempts) * 100)
        : 0;

    const latencySeries = bucketStarts.map((bucketStartMs) => {
      const bucketStart = new Date(bucketStartMs).toISOString();
      const bucket = queryBucketMap.get(bucketStart);
      const sampleCount = bucket?.latencySampleCount ?? 0;
      return {
        bucketStart,
        avgLatencyMs:
          sampleCount > 0
            ? this.round2((bucket?.latencySumMs ?? 0) / sampleCount)
            : null,
        sampleCount,
      };
    });

    const errorRateSeries = bucketStarts.map((bucketStartMs) => {
      const bucketStart = new Date(bucketStartMs).toISOString();
      const bucket = attemptBucketMap.get(bucketStart);
      const total = bucket?.totalAttempts ?? 0;
      const failed = bucket?.failedAttempts ?? 0;
      return {
        bucketStart,
        errorRatePct: total > 0 ? this.round2((failed / total) * 100) : null,
        totalAttempts: total,
        failedAttempts: failed,
      };
    });

    const throttledRateSeries = bucketStarts.map((bucketStartMs) => {
      const bucketStart = new Date(bucketStartMs).toISOString();
      const bucket = attemptBucketMap.get(bucketStart);
      const failed = bucket?.failedAttempts ?? 0;
      const throttled = bucket?.throttledAttempts ?? 0;
      return {
        bucketStart,
        throttledPct:
          failed > 0 ? this.round2((throttled / failed) * 100) : null,
        failedAttempts: failed,
        throttledAttempts: throttled,
      };
    });

    const response: DashboardAnalyticsResponse = {
      days,
      granularity,
      kpis: {
        totalQueries,
        totalDocuments: docs.count ?? 0,
        totalEntities: entities.count ?? 0,
        totalTokens,
      },
      performance: {
        avgLatencyMs,
        errorRatePct,
        throttledPct,
        peakLoadPerMin,
      },
      trend,
      timeseries: {
        latency: latencySeries,
        errorRate: errorRateSeries,
        throttledRate: throttledRateSeries,
      },
      systemHealth,
      recentActivity: canReadAudit
        ? ((recentActivity.data ?? []) as DashboardAuditLogRow[])
        : [],
    };

    await this.writeDashboardCache(cacheKey, response);
    return response;
  }

  private async readDashboardCache(
    cacheKey: string,
  ): Promise<DashboardAnalyticsResponse | null> {
    if (!this.cache) return null;
    try {
      const raw = await this.cache.get<unknown>(cacheKey);
      if (typeof raw === 'string') {
        const parsed: unknown = JSON.parse(raw);
        return parsed as DashboardAnalyticsResponse;
      }
      if (raw && typeof raw === 'object') {
        return raw as DashboardAnalyticsResponse;
      }
    } catch (error) {
      this.logger.warn(
        `Dashboard cache read failed: ${this.errorMessage(error)}`,
      );
    }
    return null;
  }

  private async writeDashboardCache(cacheKey: string, response: unknown) {
    if (!this.cache) return;
    try {
      await this.cache.set(cacheKey, JSON.stringify(response), {
        ex: UsageService.DASHBOARD_CACHE_TTL_S,
      });
    } catch (error) {
      this.logger.warn(
        `Dashboard cache write failed: ${this.errorMessage(error)}`,
      );
    }
  }

  /**
   * Hard retention: permanently deletes query_logs / audit_logs older than
   * the configured window. Runs nightly from the worker; batched so no
   * single statement holds long locks or burns the disk IO budget at once.
   */
  async purgeExpiredLogs() {
    const daysRaw = Number(process.env.LOGS_RETENTION_DAYS ?? '90');
    const days =
      Number.isFinite(daysRaw) && daysRaw > 0 ? Math.trunc(daysRaw) : 90;
    const cutoff = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();
    const batchSize = 5000;

    const purged: Record<string, number> = {};
    for (const table of ['query_logs', 'audit_logs'] as const) {
      let total = 0;
      for (;;) {
        const { data, error } = await this.supabase.admin
          .from(table)
          .select('id')
          .lt('created_at', cutoff)
          .order('created_at', { ascending: true })
          .limit(batchSize);
        if (error) throw new Error(error.message);
        const ids = (data ?? []).map((row) => (row as { id: string }).id);
        if (ids.length === 0) break;
        const { error: deleteError } = await this.supabase.admin
          .from(table)
          .delete()
          .in('id', ids);
        if (deleteError) throw new Error(deleteError.message);
        total += ids.length;
        if (ids.length < batchSize) break;
      }
      purged[table] = total;
    }

    this.logger.log(
      `Logs retention purged older than ${cutoff}: ${JSON.stringify(purged)}`,
    );
    return { cutoff, purged };
  }

  private normalizeDays(value?: number) {
    if (!Number.isFinite(value)) return UsageService.DEFAULT_DAYS;
    const rounded = Math.floor(Number(value));
    return UsageService.ALLOWED_DAYS.has(rounded)
      ? rounded
      : UsageService.DEFAULT_DAYS;
  }

  private resolveGranularity(days: number): DashboardGranularity {
    if (days === 1) return 'hour';
    if (days === 90) return 'week';
    return 'day';
  }

  private initQueryBucketMap(bucketStarts: number[]) {
    const map = new Map<string, QueryBucketStats>();
    for (const bucketStartMs of bucketStarts) {
      const bucketStart = new Date(bucketStartMs).toISOString();
      map.set(bucketStart, {
        bucketStart,
        queries: 0,
        tokens: 0,
        latencySumMs: 0,
        latencySampleCount: 0,
      });
    }
    return map;
  }

  private initAttemptBucketMap(bucketStarts: number[]) {
    const map = new Map<string, AttemptBucketStats>();
    for (const bucketStartMs of bucketStarts) {
      const bucketStart = new Date(bucketStartMs).toISOString();
      map.set(bucketStart, {
        bucketStart,
        totalAttempts: 0,
        failedAttempts: 0,
        throttledAttempts: 0,
      });
    }
    return map;
  }

  private buildBucketStarts(granularity: DashboardGranularity, days: number) {
    const nowMs = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    if (granularity === 'hour') {
      const currentHour = this.floorToGranularity(nowMs, 'hour');
      const buckets: number[] = [];
      for (let i = 23; i >= 0; i -= 1) {
        buckets.push(currentHour - i * oneHour);
      }
      return buckets;
    }

    if (granularity === 'day') {
      const currentDay = this.floorToGranularity(nowMs, 'day');
      const buckets: number[] = [];
      for (let i = days - 1; i >= 0; i -= 1) {
        buckets.push(currentDay - i * oneDay);
      }
      return buckets;
    }

    const startMs = nowMs - days * oneDay;
    const firstWeek = this.floorToGranularity(startMs, 'week');
    const currentWeek = this.floorToGranularity(nowMs, 'week');
    const buckets: number[] = [];
    for (let cursor = firstWeek; cursor <= currentWeek; cursor += 7 * oneDay) {
      buckets.push(cursor);
    }
    return buckets;
  }

  private floorToGranularity(
    timestampMs: number,
    granularity: DashboardGranularity,
  ) {
    const date = new Date(timestampMs);
    if (granularity === 'hour') {
      date.setUTCMinutes(0, 0, 0);
      return date.getTime();
    }
    if (granularity === 'day') {
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
    }

    date.setUTCHours(0, 0, 0, 0);
    const utcDay = date.getUTCDay();
    const diffToMonday = (utcDay + 6) % 7;
    date.setUTCDate(date.getUTCDate() - diffToMonday);
    return date.getTime();
  }

  private round2(value: number) {
    return Math.round(value * 100) / 100;
  }

  private async getSystemHealth(): Promise<DashboardHealthResult> {
    const cached = this.systemHealthCache;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    if (this.systemHealthInFlight) {
      return this.systemHealthInFlight;
    }

    this.systemHealthInFlight = this.computeSystemHealth();
    try {
      const value = await this.systemHealthInFlight;
      this.systemHealthCache = {
        value,
        expiresAt: Date.now() + UsageService.SYSTEM_HEALTH_TTL_MS,
      };
      return value;
    } finally {
      this.systemHealthInFlight = null;
    }
  }

  private async computeSystemHealth(): Promise<DashboardHealthResult> {
    const components = [
      this.systemHealth.checkBackend(),
      await this.systemHealth.checkDatabase(),
      await this.systemHealth.checkQdrant(),
      await this.systemHealth.checkRedis(),
    ];

    const weightOf = (component: HealthComponent) =>
      HEALTH_COMPONENT_WEIGHTS[component.name];
    const activeWeight = components
      .filter((component) => component.status !== 'not_configured')
      .reduce((sum, component) => sum + weightOf(component), 0);
    const upWeight = components
      .filter((component) => component.status === 'up')
      .reduce((sum, component) => sum + weightOf(component), 0);

    const percent =
      activeWeight > 0 ? Math.round((upWeight / activeWeight) * 100) : 0;

    return { percent, components };
  }

  private async decodeQueryLogRow(
    workspaceId: string,
    row: QueryLogStorageRow,
  ) {
    const query_text = await this.resolveStoredText(
      workspaceId,
      row.query_text,
      row.query_text_ciphertext,
      row.query_text_iv,
      row.query_text_tag,
      row.query_text_enc_version,
    );
    const answer_text = await this.resolveStoredText(
      workspaceId,
      row.answer_text ?? '',
      row.answer_text_ciphertext,
      row.answer_text_iv,
      row.answer_text_tag,
      row.answer_text_enc_version,
    );

    return {
      id: row.id,
      query_text,
      answer_text,
      total_tokens: row.total_tokens,
      latency_ms: row.latency_ms,
      success: row.success,
      created_at: row.created_at,
    };
  }

  private async resolveStoredText(
    workspaceId: string,
    legacyText: string,
    ciphertext: string | null,
    iv: string | null,
    tag: string | null,
    encVersion: number | null,
  ) {
    if (ciphertext && iv && tag && encVersion) {
      return this.encryption.decryptValue(workspaceId, {
        ciphertext,
        iv,
        tag,
        encVersion,
      });
    }

    return legacyText;
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'UnknownError';
  }
}
