CREATE TABLE chat_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_id       UUID REFERENCES entities(id) ON DELETE SET NULL,
  model_config_id UUID REFERENCES model_configs(id) ON DELETE SET NULL,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_workspace ON chat_sessions(workspace_id);
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_sessions_select" ON chat_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "chat_sessions_insert" ON chat_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat_sessions_update" ON chat_sessions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "chat_sessions_delete" ON chat_sessions
  FOR DELETE USING (user_id = auth.uid());

CREATE TABLE chat_messages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content      TEXT NOT NULL,
  citations    JSONB NOT NULL DEFAULT '[]',
  metadata     JSONB NOT NULL DEFAULT '{}',
  tokens_used  INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_workspace ON chat_messages(workspace_id);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT USING (
    session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY "chat_messages_insert" ON chat_messages
  FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid())
  );

CREATE TABLE query_logs (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id           UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_id              UUID REFERENCES entities(id) ON DELETE SET NULL,
  user_id                UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id             UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  model_config_id        UUID REFERENCES model_configs(id) ON DELETE SET NULL,
  provider_connection_id UUID REFERENCES provider_connections(id) ON DELETE SET NULL,
  query_text             TEXT NOT NULL,
  resolved_entity_ids    UUID[] NOT NULL DEFAULT '{}',
  retrieved_chunk_ids    UUID[] NOT NULL DEFAULT '{}',
  answer_text            TEXT,
  prompt_tokens          INTEGER,
  completion_tokens      INTEGER,
  total_tokens           INTEGER,
  latency_ms             INTEGER,
  success                BOOLEAN NOT NULL DEFAULT TRUE,
  error_message          TEXT,
  metadata               JSONB NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_query_logs_workspace ON query_logs(workspace_id);
CREATE INDEX idx_query_logs_user ON query_logs(user_id);
CREATE INDEX idx_query_logs_created_at ON query_logs(created_at DESC);

ALTER TABLE query_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "query_logs_select" ON query_logs
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );
