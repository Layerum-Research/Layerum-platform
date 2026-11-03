CREATE TABLE workspace_api_keys (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id             UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  role                     workspace_role NOT NULL DEFAULT 'api_only',
  key_prefix               TEXT NOT NULL,
  key_hash                 TEXT NOT NULL,
  last4                    TEXT NOT NULL,
  allowed_entity_ids       UUID[] NOT NULL DEFAULT '{}',
  allowed_model_config_ids UUID[] NOT NULL DEFAULT '{}',
  rpm_limit                INTEGER,
  daily_token_limit        INTEGER,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at               TIMESTAMPTZ,
  last_used_at             TIMESTAMPTZ,
  revoked_at               TIMESTAMPTZ,
  created_by               UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT workspace_api_keys_prefix_unique UNIQUE (key_prefix),
  CONSTRAINT workspace_api_keys_scope_entities_non_empty CHECK (array_length(allowed_entity_ids, 1) > 0),
  CONSTRAINT workspace_api_keys_scope_models_non_empty CHECK (array_length(allowed_model_config_ids, 1) > 0),
  CONSTRAINT workspace_api_keys_role_allowed CHECK (role IN ('api_only', 'viewer', 'editor'))
);

CREATE INDEX idx_workspace_api_keys_workspace ON workspace_api_keys(workspace_id);
CREATE INDEX idx_workspace_api_keys_prefix ON workspace_api_keys(key_prefix);
CREATE INDEX idx_workspace_api_keys_active ON workspace_api_keys(is_active);

ALTER TABLE workspace_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_api_keys_select" ON workspace_api_keys
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "workspace_api_keys_insert" ON workspace_api_keys
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "workspace_api_keys_update" ON workspace_api_keys
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "workspace_api_keys_delete" ON workspace_api_keys
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE TRIGGER trg_workspace_api_keys_updated_at
  BEFORE UPDATE ON workspace_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
