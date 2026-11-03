CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (
    type IN (
      'api_key_created',
      'api_key_revoked',
      'api_key_rotated',
      'workspace_invite_accepted',
      'ingestion_failed',
      'storage_quota_warning',
      'storage_quota_reached',
      'system_health_down',
      'system_health_recovered'
    )
  ),
  severity     TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  payload      JSONB NOT NULL DEFAULT '{}',
  dedupe_key   TEXT,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, workspace_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_read_purge
  ON notifications(read_at)
  WHERE read_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_unread_dedupe
  ON notifications(user_id, dedupe_key)
  WHERE read_at IS NULL AND dedupe_key IS NOT NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION insert_notifications(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO notifications (user_id, workspace_id, type, severity, payload, dedupe_key)
  SELECT
    r.user_id,
    r.workspace_id,
    r.type,
    r.severity,
    COALESCE(r.payload, '{}'::jsonb),
    r.dedupe_key
  FROM jsonb_to_recordset(p_rows) AS r(
    user_id UUID,
    workspace_id UUID,
    type TEXT,
    severity TEXT,
    payload JSONB,
    dedupe_key TEXT
  )
  ON CONFLICT (user_id, dedupe_key) WHERE read_at IS NULL AND dedupe_key IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION insert_notifications(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION insert_notifications(JSONB) TO service_role;
