CREATE TABLE subscription_plans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  workspace_limit INTEGER NOT NULL CHECK (workspace_limit > 0),
  capacity_bytes  BIGINT NOT NULL CHECK (capacity_bytes > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_subscriptions (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan_id                  UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  workspace_limit_override INTEGER CHECK (workspace_limit_override > 0),
  capacity_bytes_override  BIGINT CHECK (capacity_bytes_override > 0),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscription_plans_code ON subscription_plans(code);
CREATE INDEX idx_user_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_plan ON user_subscriptions(plan_id);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY "subscription_plans_select" ON subscription_plans
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "user_subscriptions_select_own" ON user_subscriptions
  FOR SELECT USING (user_id = auth.uid());

INSERT INTO subscription_plans (code, name, workspace_limit, capacity_bytes)
VALUES
  ('free', 'Free', 1, 2::bigint * 1024 * 1024 * 1024),
  ('pro', 'Pro', 3, 15::bigint * 1024 * 1024 * 1024),
  ('enterprise', 'Enterprise', 25, 500::bigint * 1024 * 1024 * 1024)
ON CONFLICT (code) DO NOTHING;

INSERT INTO user_subscriptions (user_id, plan_id)
SELECT u.id, p.id
FROM users u
CROSS JOIN LATERAL (
  SELECT id
  FROM subscription_plans
  WHERE code = 'free'
  LIMIT 1
) p
ON CONFLICT (user_id) DO NOTHING;

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
    COALESCE(e.entity_bytes, 0) + COALESCE(d.document_bytes, 0) + COALESCE(c.chunk_bytes, 0) AS usage_bytes
  FROM ids
  LEFT JOIN member_stats m ON m.workspace_id = ids.workspace_id
  LEFT JOIN entity_stats e ON e.workspace_id = ids.workspace_id
  LEFT JOIN document_stats d ON d.workspace_id = ids.workspace_id
  LEFT JOIN chunk_stats c ON c.workspace_id = ids.workspace_id;
$$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_subscriptions (user_id, plan_id)
  SELECT NEW.id, p.id
  FROM public.subscription_plans p
  WHERE p.code = 'free'
  LIMIT 1
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
