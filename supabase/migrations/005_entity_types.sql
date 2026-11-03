CREATE TABLE entity_types (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  label        TEXT NOT NULL,
  icon         TEXT,
  color        TEXT,
  config       JSONB NOT NULL DEFAULT '{}',
  created_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, name)
);

CREATE INDEX idx_entity_types_workspace ON entity_types(workspace_id);

ALTER TABLE entity_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_types_select" ON entity_types
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );

CREATE POLICY "entity_types_insert" ON entity_types
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY "entity_types_update" ON entity_types
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY "entity_types_delete" ON entity_types
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
