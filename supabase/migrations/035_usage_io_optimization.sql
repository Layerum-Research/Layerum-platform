-- Usage analytics aggregation moved into SQL so the backend no longer
-- pulls unbounded query_logs / audit_logs row sets into Node.

CREATE INDEX IF NOT EXISTS idx_query_logs_workspace_failures
  ON query_logs (workspace_id, created_at DESC)
  WHERE success = false;

CREATE OR REPLACE FUNCTION workspace_query_summary(p_workspace_id UUID)
RETURNS TABLE (
  total_queries BIGINT,
  total_tokens BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*)::BIGINT,
    COALESCE(SUM(total_tokens), 0)::BIGINT
  FROM query_logs
  WHERE workspace_id = p_workspace_id;
$$;

ALTER FUNCTION workspace_query_summary(UUID)
  SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION workspace_query_buckets(
  p_workspace_id UUID,
  p_since TIMESTAMPTZ,
  p_granularity TEXT
)
RETURNS TABLE (
  bucket_start TIMESTAMP,
  queries BIGINT,
  tokens BIGINT,
  latency_sum BIGINT,
  latency_count BIGINT,
  failures BIGINT,
  throttled BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    -- Truncate in UTC wall-clock so buckets always align with the API,
    -- regardless of the database session timezone.
    date_trunc(p_granularity, created_at AT TIME ZONE 'UTC') AS bucket_start,
    COUNT(*)::BIGINT AS queries,
    COALESCE(SUM(total_tokens), 0)::BIGINT AS tokens,
    COALESCE(SUM(CASE WHEN latency_ms IS NOT NULL AND latency_ms >= 0 THEN latency_ms ELSE 0 END), 0)::BIGINT AS latency_sum,
    COUNT(CASE WHEN latency_ms IS NOT NULL AND latency_ms >= 0 THEN 1 END)::BIGINT AS latency_count,
    COUNT(CASE WHEN success = false THEN 1 END)::BIGINT AS failures,
    COUNT(
      CASE WHEN success = false AND (
        LOWER(COALESCE(metadata->>'errorCode', '')) LIKE '%ratelimiterror%'
        OR LOWER(COALESCE(metadata->>'errorCode', '')) LIKE '%rate\_limit%' ESCAPE '\'
        OR LOWER(COALESCE(metadata->>'errorCode', '')) LIKE '%ratelimit%'
        OR LOWER(COALESCE(metadata->>'errorCode', '')) LIKE '%too\_many\_requests%' ESCAPE '\'
        OR LOWER(COALESCE(metadata->>'errorCode', '')) LIKE '%toomanyrequests%'
        OR LOWER(COALESCE(metadata->>'errorCode', '')) LIKE '%429%'
        OR LOWER(COALESCE(error_message, metadata->>'errorMessage', '')) LIKE '%rate limit%'
        OR LOWER(COALESCE(error_message, metadata->>'errorMessage', '')) LIKE '%too many requests%'
        OR LOWER(COALESCE(error_message, metadata->>'errorMessage', '')) LIKE '%quota exceeded%'
        OR LOWER(COALESCE(error_message, metadata->>'errorMessage', '')) LIKE '%throttl%'
        OR LOWER(COALESCE(error_message, metadata->>'errorMessage', '')) LIKE '%429%'
      ) THEN 1 END
    )::BIGINT AS throttled
  FROM query_logs
  WHERE workspace_id = p_workspace_id
    AND created_at >= p_since
  GROUP BY 1;
$$;

ALTER FUNCTION workspace_query_buckets(UUID, TIMESTAMPTZ, TEXT)
  SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION workspace_peak_load(
  p_workspace_id UUID,
  p_since TIMESTAMPTZ
)
RETURNS TABLE (
  peak_per_min BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(MAX(minute_count), 0)::BIGINT AS peak_per_min
  FROM (
    SELECT COUNT(*) AS minute_count
    FROM query_logs
    WHERE workspace_id = p_workspace_id
      AND created_at >= p_since
    GROUP BY date_trunc('minute', created_at)
  ) per_minute;
$$;

ALTER FUNCTION workspace_peak_load(UUID, TIMESTAMPTZ)
  SET search_path = public, pg_temp;
