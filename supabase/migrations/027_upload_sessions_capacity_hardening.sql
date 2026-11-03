CREATE TABLE IF NOT EXISTS upload_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  object_key TEXT NOT NULL UNIQUE,
  declared_size_bytes BIGINT NOT NULL CHECK (declared_size_bytes > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',
      'completed',
      'cleanup_pending',
      'cleanup_failed',
      'expired_cleaned',
      'aborted'
    )
  ),
  expires_at TIMESTAMPTZ NOT NULL,
  data_source_id UUID REFERENCES data_sources(id) ON DELETE SET NULL,
  cleanup_attempts INTEGER NOT NULL DEFAULT 0,
  next_cleanup_at TIMESTAMPTZ,
  cleaned_up_at TIMESTAMPTZ,
  last_cleanup_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_workspace ON upload_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_owner ON upload_sessions(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires ON upload_sessions(expires_at);

ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_upload_sessions_updated_at
  BEFORE UPDATE ON upload_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY "upload_sessions_select_own" ON upload_sessions
  FOR SELECT USING (
    created_by = auth.uid() OR owner_user_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION workspace_user_usage_stats(p_workspace_ids UUID[])
RETURNS TABLE (
  workspace_id UUID,
  member_count BIGINT,
  entity_count BIGINT,
  document_count BIGINT,
  chunk_count BIGINT,
  entity_bytes BIGINT,
  document_bytes BIGINT,
  chunk_bytes BIGINT,
  usage_bytes BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH ids AS (
    SELECT unnest(p_workspace_ids)::uuid AS workspace_id
  ),
  member_stats AS (
    SELECT workspace_id, COUNT(*)::bigint AS member_count
    FROM workspace_users
    WHERE workspace_id = ANY (p_workspace_ids)
    GROUP BY workspace_id
  ),
  entity_stats AS (
    SELECT
      e.workspace_id,
      COUNT(*)::bigint AS entity_count,
      COALESCE(SUM(pg_column_size(e)), 0)::bigint AS entity_bytes
    FROM entities e
    WHERE e.workspace_id = ANY (p_workspace_ids)
    GROUP BY e.workspace_id
  ),
  document_stats AS (
    SELECT
      d.workspace_id,
      COUNT(*)::bigint AS document_count,
      COALESCE(SUM(pg_column_size(d)), 0)::bigint AS document_bytes
    FROM documents d
    WHERE d.workspace_id = ANY (p_workspace_ids)
    GROUP BY d.workspace_id
  ),
  chunk_stats AS (
    SELECT
      c.workspace_id,
      COUNT(*)::bigint AS chunk_count,
      COALESCE(SUM(pg_column_size(c)), 0)::bigint AS chunk_bytes
    FROM document_chunks c
    WHERE c.workspace_id = ANY (p_workspace_ids)
    GROUP BY c.workspace_id
  ),
  s3_stats AS (
    SELECT
      dedup.workspace_id,
      COALESCE(SUM(dedup.file_size), 0)::bigint AS s3_file_bytes
    FROM (
      SELECT
        ds.workspace_id,
        ds.storage_path,
        MAX(COALESCE(ds.file_size, 0))::bigint AS file_size
      FROM data_sources ds
      WHERE ds.workspace_id = ANY (p_workspace_ids)
        AND ds.storage_backend = 's3'
        AND ds.storage_path IS NOT NULL
      GROUP BY ds.workspace_id, ds.storage_path
    ) dedup
    GROUP BY dedup.workspace_id
  ),
  reservation_stats AS (
    SELECT
      us.workspace_id,
      COALESCE(SUM(us.declared_size_bytes), 0)::bigint AS reserved_bytes
    FROM upload_sessions us
    WHERE us.workspace_id = ANY (p_workspace_ids)
      AND us.status IN ('pending', 'cleanup_pending', 'cleanup_failed')
    GROUP BY us.workspace_id
  )
  SELECT
    ids.workspace_id,
    COALESCE(m.member_count, 0) AS member_count,
    COALESCE(e.entity_count, 0) AS entity_count,
    COALESCE(d.document_count, 0) AS document_count,
    COALESCE(c.chunk_count, 0) AS chunk_count,
    COALESCE(e.entity_bytes, 0) AS entity_bytes,
    COALESCE(d.document_bytes, 0) AS document_bytes,
    COALESCE(c.chunk_bytes, 0) AS chunk_bytes,
    COALESCE(e.entity_bytes, 0)
      + COALESCE(d.document_bytes, 0)
      + COALESCE(c.chunk_bytes, 0)
      + COALESCE(s3.s3_file_bytes, 0)
      + COALESCE(r.reserved_bytes, 0) AS usage_bytes
  FROM ids
  LEFT JOIN member_stats m ON m.workspace_id = ids.workspace_id
  LEFT JOIN entity_stats e ON e.workspace_id = ids.workspace_id
  LEFT JOIN document_stats d ON d.workspace_id = ids.workspace_id
  LEFT JOIN chunk_stats c ON c.workspace_id = ids.workspace_id
  LEFT JOIN s3_stats s3 ON s3.workspace_id = ids.workspace_id
  LEFT JOIN reservation_stats r ON r.workspace_id = ids.workspace_id;
$$;

CREATE OR REPLACE FUNCTION reserve_upload_session(
  p_workspace_id UUID,
  p_entity_id UUID,
  p_created_by UUID,
  p_object_key TEXT,
  p_declared_size_bytes BIGINT,
  p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
  upload_id UUID,
  owner_user_id UUID,
  capacity_bytes BIGINT,
  used_bytes BIGINT,
  projected_used_bytes BIGINT,
  remaining_bytes BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_user_id UUID;
  v_capacity_bytes BIGINT;
  v_used_bytes BIGINT;
  v_projected_used_bytes BIGINT;
  v_upload_id UUID;
BEGIN
  IF p_declared_size_bytes IS NULL OR p_declared_size_bytes <= 0 THEN
    RAISE EXCEPTION 'Declared upload size must be positive';
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= NOW() THEN
    RAISE EXCEPTION 'Upload session expiry must be in the future';
  END IF;

  SELECT w.created_by
  INTO v_owner_user_id
  FROM workspaces w
  WHERE w.id = p_workspace_id;

  IF v_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Workspace owner not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM entities e
    WHERE e.id = p_entity_id
      AND e.workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Entity does not belong to workspace';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('capacity:' || v_owner_user_id::text));

  SELECT COALESCE(us.capacity_bytes_override, sp.capacity_bytes)
  INTO v_capacity_bytes
  FROM user_subscriptions us
  JOIN subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = v_owner_user_id;

  IF v_capacity_bytes IS NULL THEN
    SELECT sp.capacity_bytes
    INTO v_capacity_bytes
    FROM subscription_plans sp
    WHERE sp.code = 'free'
    LIMIT 1;
  END IF;

  IF v_capacity_bytes IS NULL OR v_capacity_bytes <= 0 THEN
    RAISE EXCEPTION 'Workspace owner subscription capacity is not configured';
  END IF;

  SELECT COALESCE(SUM(stats.usage_bytes), 0)::bigint
  INTO v_used_bytes
  FROM workspace_user_usage_stats(
    COALESCE(
      (SELECT array_agg(w.id)::uuid[] FROM workspaces w WHERE w.created_by = v_owner_user_id),
      ARRAY[]::uuid[]
    )
  ) stats;

  v_projected_used_bytes := v_used_bytes + p_declared_size_bytes;

  IF v_projected_used_bytes > v_capacity_bytes THEN
    RAISE EXCEPTION 'STORAGE_CAPACITY_EXCEEDED';
  END IF;

  INSERT INTO upload_sessions (
    workspace_id,
    entity_id,
    owner_user_id,
    created_by,
    object_key,
    declared_size_bytes,
    status,
    expires_at,
    next_cleanup_at
  )
  VALUES (
    p_workspace_id,
    p_entity_id,
    v_owner_user_id,
    p_created_by,
    p_object_key,
    p_declared_size_bytes,
    'pending',
    p_expires_at,
    p_expires_at
  )
  RETURNING id INTO v_upload_id;

  RETURN QUERY SELECT
    v_upload_id,
    v_owner_user_id,
    v_capacity_bytes,
    v_used_bytes,
    v_projected_used_bytes,
    GREATEST(0, v_capacity_bytes - v_projected_used_bytes);
END;
$$;

CREATE OR REPLACE FUNCTION finalize_upload_session(
  p_upload_id UUID,
  p_workspace_id UUID,
  p_entity_id UUID,
  p_data_source_id UUID,
  p_actual_size_bytes BIGINT
)
RETURNS TABLE (
  object_key TEXT,
  declared_size_bytes BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row upload_sessions%ROWTYPE;
BEGIN
  IF p_actual_size_bytes IS NULL OR p_actual_size_bytes <= 0 THEN
    RAISE EXCEPTION 'Upload size must be positive';
  END IF;

  SELECT *
  INTO v_row
  FROM upload_sessions
  WHERE id = p_upload_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Upload session not found';
  END IF;

  IF v_row.workspace_id <> p_workspace_id OR v_row.entity_id <> p_entity_id THEN
    RAISE EXCEPTION 'Upload session scope mismatch';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('capacity:' || v_row.owner_user_id::text));

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Upload session is not pending';
  END IF;

  IF v_row.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Upload session has expired';
  END IF;

  IF p_actual_size_bytes <> v_row.declared_size_bytes THEN
    RAISE EXCEPTION 'UPLOAD_SIZE_MISMATCH';
  END IF;

  UPDATE upload_sessions
  SET
    status = 'completed',
    data_source_id = p_data_source_id,
    updated_at = NOW()
  WHERE id = p_upload_id;

  RETURN QUERY SELECT v_row.object_key, v_row.declared_size_bytes;
END;
$$;

CREATE OR REPLACE FUNCTION claim_upload_sessions_for_cleanup(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  upload_id UUID,
  object_key TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH candidates AS (
    SELECT us.id, us.object_key
    FROM upload_sessions us
    WHERE (
      (us.status = 'pending' AND us.expires_at <= NOW())
      OR us.status = 'cleanup_pending'
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

CREATE OR REPLACE FUNCTION mark_upload_session_cleanup_result(
  p_upload_id UUID,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF COALESCE(p_success, false) THEN
    UPDATE upload_sessions
    SET
      status = 'expired_cleaned',
      cleaned_up_at = NOW(),
      last_cleanup_error = NULL,
      updated_at = NOW()
    WHERE id = p_upload_id;
  ELSE
    UPDATE upload_sessions
    SET
      status = 'cleanup_failed',
      cleanup_attempts = cleanup_attempts + 1,
      next_cleanup_at = NOW() + INTERVAL '5 minutes',
      last_cleanup_error = LEFT(COALESCE(p_error, 'cleanup failed'), 2000),
      updated_at = NOW()
    WHERE id = p_upload_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION abort_upload_session(
  p_upload_id UUID,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE upload_sessions
  SET
    status = 'aborted',
    last_cleanup_error = LEFT(COALESCE(p_error, 'aborted'), 2000),
    updated_at = NOW()
  WHERE id = p_upload_id
    AND status IN ('pending', 'cleanup_pending', 'cleanup_failed');
END;
$$;
