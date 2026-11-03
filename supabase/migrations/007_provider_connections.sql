CREATE TABLE provider_connections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_id       UUID REFERENCES entities(id) ON DELETE CASCADE,
  provider        provider_name NOT NULL,
  display_name    TEXT NOT NULL,
  encrypted_key   TEXT NOT NULL,
  key_iv          TEXT NOT NULL,
  key_tag         TEXT NOT NULL,
  key_preview     TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_tested_at  TIMESTAMPTZ,
  test_passed     BOOLEAN,
  created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_connections_workspace ON provider_connections(workspace_id);
CREATE INDEX idx_provider_connections_entity ON provider_connections(entity_id);

ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_connections_select" ON provider_connections
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "provider_connections_insert" ON provider_connections
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "provider_connections_update" ON provider_connections
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "provider_connections_delete" ON provider_connections
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
