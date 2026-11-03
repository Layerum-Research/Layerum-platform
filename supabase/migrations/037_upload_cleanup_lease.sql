CREATE OR REPLACE FUNCTION claim_upload_sessions_for_cleanup(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  upload_id UUID,
  object_key TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH candidates AS (
    SELECT us.id, us.object_key
    FROM upload_sessions us
    WHERE (
      (us.status = 'pending' AND us.expires_at <= NOW())
      OR (
        us.status = 'cleanup_pending'
        AND us.updated_at < NOW() - INTERVAL '15 minutes'
      )
      OR (
        us.status = 'cleanup_failed'
        AND (us.next_cleanup_at IS NULL OR us.next_cleanup_at <= NOW())
      )
    )
    ORDER BY us.expires_at ASC, us.created_at ASC
    LIMIT GREATEST(1, COALESCE(p_limit, 50))
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE upload_sessions target
    SET
      status = 'cleanup_pending',
      updated_at = NOW()
    FROM candidates c
    WHERE target.id = c.id
    RETURNING target.id, target.object_key
  )
  SELECT updated.id AS upload_id, updated.object_key
  FROM updated;
$$;

CREATE INDEX IF NOT EXISTS idx_upload_sessions_cleanup_due
  ON upload_sessions(expires_at, created_at)
  WHERE status IN ('pending', 'cleanup_pending', 'cleanup_failed');

DROP INDEX IF EXISTS idx_upload_sessions_expires;
