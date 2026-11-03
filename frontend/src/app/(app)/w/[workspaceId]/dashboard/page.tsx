'use client';

import { use, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Activity,
  FileText,
  KeyRound,
  Network,
  RefreshCw,
  Server,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { WorkspaceTopbar } from '@/components/workspace-topbar';
import { WorkspaceAccessGate, useWorkspaceAccess } from '@/components/workspace-access';
import type { AuditLog, DashboardAnalytics } from '@/lib/types';
import { SkeletonRows } from '@/components/loader';
import {
  getAuditHeadline,
  getAuditStatus,
  getAuditSubject,
  getAuditUser,
} from '@/lib/audit-log-utils';
import './dashboard-page.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
});

const RANGE_OPTIONS = [
  { label: '1D', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '3M', days: 90 },
] as const;

type DashboardRangeDays = (typeof RANGE_OPTIONS)[number]['days'];
type DashboardGranularity = DashboardAnalytics['granularity'];

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

const formatInteger = (value: number) => new Intl.NumberFormat('en').format(value);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function recentTime(createdAt: string) {
  const ms = new Date(createdAt).getTime();
  if (Number.isNaN(ms)) return 'Unknown';
  const diffMin = Math.max(1, Math.floor((Date.now() - ms) / 60000));
  if (diffMin < 60) return `${diffMin} mins ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
}

function shortActivityId(value: string) {
  const normalized = value.replace(/-/g, '');
  if (/^[a-f0-9]{32}$/i.test(normalized)) {
    return normalized.slice(0, 8);
  }
  return value;
}

function iconForActivity(log: AuditLog) {
  const resource = log.resource.toLowerCase();
  const action = log.action.toLowerCase();
  if (resource.includes('api_key')) return KeyRound;
  if (resource.includes('document') || action === 'upload') return FileText;
  if (action === 'query') return Activity;
  if (action === 'create' || action === 'update') return Network;
  return Server;
}

function floorToHour(ms: number) {
  const date = new Date(ms);
  date.setUTCMinutes(0, 0, 0);
  return date.getTime();
}

function floorToDay(ms: number) {
  const date = new Date(ms);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function floorToWeek(ms: number) {
  const date = new Date(ms);
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diffToMonday);
  return date.getTime();
}

function fallbackGranularity(days: DashboardRangeDays): DashboardGranularity {
  if (days === 1) return 'hour';
  if (days === 90) return 'week';
  return 'day';
}

function fallbackTrend(
  days: DashboardRangeDays,
  granularity: DashboardGranularity,
) {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;

  if (granularity === 'hour') {
    const currentHour = floorToHour(now);
    const out: Array<{ bucketStart: string; queries: number; tokens: number }> = [];
    for (let i = 23; i >= 0; i -= 1) {
      out.push({
        bucketStart: new Date(currentHour - i * oneHour).toISOString(),
        queries: 0,
        tokens: 0,
      });
    }
    return out;
  }

  if (granularity === 'day') {
    const currentDay = floorToDay(now);
    const out: Array<{ bucketStart: string; queries: number; tokens: number }> = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      out.push({
        bucketStart: new Date(currentDay - i * oneDay).toISOString(),
        queries: 0,
        tokens: 0,
      });
    }
    return out;
  }

  const start = floorToWeek(now - days * oneDay);
  const end = floorToWeek(now);
  const out: Array<{ bucketStart: string; queries: number; tokens: number }> = [];
  for (let cursor = start; cursor <= end; cursor += 7 * oneDay) {
    out.push({
      bucketStart: new Date(cursor).toISOString(),
      queries: 0,
      tokens: 0,
    });
  }
  return out;
}

function formatBucketLabel(value: string, granularity: DashboardGranularity) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (granularity === 'hour') {
    return date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
  }
  if (granularity === 'week') {
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function chartLabel(value: string, granularity: DashboardGranularity) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (granularity === 'hour') {
    return date.toLocaleString('en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (granularity === 'week') {
    return `Week of ${date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`;
  }
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

// Recharts is the heaviest dependency on this page: load it lazily so weak
// PCs parse less JS before first paint. Charts render when ready.
const MetricChart = dynamic(
  () => import('./MetricChart').then((module) => module.MetricChart),
  {
    ssr: false,
    loading: () => (
      <article className="dash-metric-chart" aria-hidden="true">
        <div className="dash-metric-chart-canvas">
          <SkeletonRows count={2} height={60} />
        </div>
      </article>
    ),
  },
);

export default function DashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = use(params);
  const { session } = useAuth();
  const token = session?.access_token;
  const access = useWorkspaceAccess();
  const canViewDashboard = access.can({ type: 'role', roles: ['owner', 'admin'] });
  const [days, setDays] = useState<DashboardRangeDays>(7);

  const dashboard = useQuery({
    queryKey: ['usage-dashboard', workspaceId, days],
    queryFn: () => api.dashboardAnalytics(token!, workspaceId, days),
    enabled: Boolean(token && canViewDashboard),
    // Fetch-once per visit + manual refresh (no background poller).
    // Analytics payloads are heavy; constant polling wastes CPU/radio,
    // which matters on weak PCs and metered connections.
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    refetchInterval: false,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 403) && failureCount < 2,
  });

  const analytics = dashboard.data;
  const dashboardError = dashboard.error;
  const isForbidden = dashboardError instanceof ApiError && dashboardError.status === 403;
  const granularity = analytics?.granularity ?? fallbackGranularity(days);
  const trendRows = analytics?.trend?.length
    ? analytics.trend
    : fallbackTrend(days, granularity);
  const trendPreview = trendRows.slice(-Math.min(trendRows.length, 12));
  const maxTrendQueries = Math.max(1, ...trendRows.map((item) => item.queries));

  const totalQueries = analytics?.kpis.totalQueries ?? 0;
  const totalDocs = analytics?.kpis.totalDocuments ?? 0;
  const totalEntities = analytics?.kpis.totalEntities ?? 0;
  const totalTokens = analytics?.kpis.totalTokens ?? 0;

  const systemHealthPercent = analytics?.systemHealth.percent ?? 0;
  const filledHealthBars = Math.round((clamp(systemHealthPercent, 0, 100) / 100) * 7);
  const healthBars = Array.from({ length: 7 }, (_, index) => index < filledHealthBars);
  const systemStatus =
    systemHealthPercent >= 90 ? 'Operational' : systemHealthPercent >= 70 ? 'Degraded' : 'Outage';

  const recent = (analytics?.recentActivity ?? []).slice(0, 5);
  const avgLatency = analytics?.performance.avgLatencyMs ?? 0;
  const peakLoadPerMin = analytics?.performance.peakLoadPerMin ?? 0;
  const errorRate = analytics?.performance.errorRatePct ?? 0;
  const throttledRate = analytics?.performance.throttledPct ?? 0;

  const latencyChartData = useMemo(() => {
    const source =
      analytics?.timeseries.latency ??
      trendRows.map((row) => ({
        bucketStart: row.bucketStart,
        avgLatencyMs: null,
        sampleCount: 0,
      }));

    return source.map((point) => ({
      label: formatBucketLabel(point.bucketStart, granularity),
      fullLabel: chartLabel(point.bucketStart, granularity),
      value: point.avgLatencyMs,
    }));
  }, [analytics?.timeseries.latency, granularity, trendRows]);

  const errorChartData = useMemo(() => {
    const source =
      analytics?.timeseries.errorRate ??
      trendRows.map((row) => ({
        bucketStart: row.bucketStart,
        errorRatePct: null,
        totalAttempts: 0,
        failedAttempts: 0,
      }));

    return source.map((point) => ({
      label: formatBucketLabel(point.bucketStart, granularity),
      fullLabel: chartLabel(point.bucketStart, granularity),
      value: point.errorRatePct,
    }));
  }, [analytics?.timeseries.errorRate, granularity, trendRows]);

  const throttledChartData = useMemo(() => {
    const source =
      analytics?.timeseries.throttledRate ??
      trendRows.map((row) => ({
        bucketStart: row.bucketStart,
        throttledPct: null,
        failedAttempts: 0,
        throttledAttempts: 0,
      }));

    return source.map((point) => ({
      label: formatBucketLabel(point.bucketStart, granularity),
      fullLabel: chartLabel(point.bucketStart, granularity),
      value: point.throttledPct,
    }));
  }, [analytics?.timeseries.throttledRate, granularity, trendRows]);

  return (
    <div className={`layerum-page dashboard-page ${inter.className}`}>
      <WorkspaceTopbar section="Workspace" page="Dashboard" />
      <WorkspaceAccessGate
        requirement={{ type: 'role', roles: ['owner', 'admin'] }}
        title="Owner access required"
        description="Dashboard is available only to the workspace owner or admin."
      >
        <div className="dash-content">
          {isForbidden ? (
            <section className="dash-forbidden">
              <h2>Owner access required</h2>
              <p>Query logs and usage analytics are available only to the workspace owner.</p>
            </section>
          ) : (
            <>
            <section className="dash-range-switch" aria-label="Dashboard range">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  className={option.days === days ? 'active' : ''}
                  onClick={() => setDays(option.days)}
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                className="dash-refresh"
                onClick={() => dashboard.refetch()}
                disabled={dashboard.isFetching}
                title="Refresh analytics"
              >
                <RefreshCw size={12} className={dashboard.isFetching ? 'spinning' : ''} />
                {dashboard.isFetching ? 'Refreshing...' : 'Refresh'}
              </button>
            </section>

            <section className="dash-stats">
              <article>
                <header>
                  <h3>TOTAL QUERIES</h3>
                  <Activity size={15} />
                </header>
                <p className="value">{formatCompactNumber(totalQueries)}</p>
                <span>Last {days === 90 ? '3 months' : `${days} day${days > 1 ? 's' : ''}`}</span>
                <div
                  className="sparkline dynamic"
                  aria-hidden="true"
                  style={{ gridTemplateColumns: `repeat(${Math.max(1, trendRows.length)}, minmax(0, 1fr))` }}
                >
                  {trendRows.map((point) => {
                    const ratio = point.queries / maxTrendQueries;
                    return (
                      <em
                        key={point.bucketStart}
                        style={{ height: `${clamp(Math.round(ratio * 100), 8, 100)}%` }}
                      />
                    );
                  })}
                </div>
              </article>
              <article>
                <header>
                  <h3>DOCUMENTS INDEXED</h3>
                  <FileText size={14} />
                </header>
                <p className="value">{formatCompactNumber(totalDocs)}</p>
                <div className="capacity">
                  <small>{formatCompactNumber(totalTokens)} tokens processed in range</small>
                </div>
              </article>
              <article>
                <header>
                  <h3>TOTAL ENTITIES</h3>
                  <Network size={14} />
                </header>
                <p className="value">{formatInteger(totalEntities)}</p>
                <small>Across current workspace hierarchy</small>
              </article>
              <article>
                <header>
                  <h3>SYSTEM HEALTH</h3>
                  <strong><i /> {systemStatus}</strong>
                </header>
                <p className="value">{systemHealthPercent}%</p>
                <small>Backend, DB, vector store, Redis checks</small>
                <div className="health">
                  {healthBars.map((isOn, index) => (
                    <em key={index} style={{ opacity: isOn ? 1 : 0.25 }} />
                  ))}
                </div>
              </article>
            </section>

            <section className="dash-metrics-grid">
              <MetricChart
                title="Latency Over Time"
                subtitle="Average latency by selected buckets"
                valueLabel={`${avgLatency.toFixed(2)}ms`}
                data={latencyChartData}
                color="#8fb2ff"
                suffix=" ms"
              />
              <MetricChart
                title="Error Rate Over Time"
                subtitle="Failed query attempts percentage"
                valueLabel={`${errorRate.toFixed(2)}%`}
                data={errorChartData}
                color="#ffb4ab"
                suffix="%"
                isPercent
              />
              <MetricChart
                title="Throttled Over Time"
                subtitle="Rate-limited share of failed attempts"
                valueLabel={`${throttledRate.toFixed(2)}%`}
                data={throttledChartData}
                color="#ffd38d"
                suffix="%"
                isPercent
              />
            </section>

            <section className="dash-main">
              <article className="usage">
                <header>
                  <h2>Query Trend</h2>
                </header>
                <div className="bars">
                  {trendPreview.map((item) => (
                    <div key={item.bucketStart}>
                      <div>
                        <span>{formatBucketLabel(item.bucketStart, granularity)}</span>
                        <span className={mono.className}>
                          {formatInteger(item.queries)} reqs / {formatCompactNumber(item.tokens)} tok
                        </span>
                      </div>
                      <p>
                        <em
                          style={{
                            width: `${clamp(Math.round((item.queries / maxTrendQueries) * 100), 6, 100)}%`,
                          }}
                        />
                      </p>
                    </div>
                  ))}
                </div>
                <footer>
                  <div>
                    <label>PEAK LOAD</label>
                    <strong className={mono.className}>{formatInteger(peakLoadPerMin)} req/min</strong>
                  </div>
                  <div>
                    <label>AVG LATENCY</label>
                    <strong className={mono.className}>{avgLatency.toFixed(2)}ms</strong>
                  </div>
                  <div>
                    <label>ERROR RATE</label>
                    <strong className={mono.className}>{errorRate.toFixed(2)}%</strong>
                  </div>
                  <div>
                    <label>THROTTLED</label>
                    <strong className={mono.className}>{throttledRate.toFixed(2)}%</strong>
                  </div>
                </footer>
              </article>

              <article className="recent">
                <header>
                  <h2>Recent Activity</h2>
                  <Server size={14} />
                </header>
                <div className="list">
                  {recent.map((log) => {
                    const status = getAuditStatus(log);
                    const user = getAuditUser(log);
                    const subject = getAuditSubject(log);
                    const shortSubject = shortActivityId(subject);
                    const Icon = iconForActivity(log);
                    return (
                      <div key={log.id}>
                        <i><Icon size={12} /></i>
                        <div>
                          <p>{getAuditHeadline(log)}</p>
                          <small>
                            {recentTime(log.created_at)}
                            <span />
                            {user}
                            <span />
                            <code className={mono.className}>{shortSubject}</code>
                            <span />
                            <b className={status === 'failed' ? 'danger' : 'ok'}>
                              {status === 'failed' ? 'Failed' : 'Success'}
                            </b>
                          </small>
                        </div>
                      </div>
                    );
                  })}
                  {dashboard.isLoading ? <SkeletonRows count={4} height={54} /> : null}
                  {!dashboard.isLoading && recent.length === 0 ? <p className="empty">No activity yet.</p> : null}
                </div>
              </article>
            </section>
            </>
          )}
        </div>
      </WorkspaceAccessGate>
    </div>
  );
}
