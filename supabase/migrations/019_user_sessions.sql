CREATE TABLE IF NOT EXISTS user_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    TEXT NOT NULL,
  ip_address    TEXT,
  user_agent    TEXT,
  os_name       TEXT,
  browser_name  TEXT,
  device_type   TEXT,
  device_label  TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_last_seen
  ON user_sessions(user_id, last_seen_at DESC);

CREATE TRIGGER trg_user_sessions_updated_at
  BEFORE UPDATE ON user_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
