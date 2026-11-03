CREATE TABLE workspaces (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_by  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspaces_slug ON workspaces(slug);
CREATE INDEX idx_workspaces_created_by ON workspaces(created_by);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE TABLE workspace_users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         workspace_role NOT NULL DEFAULT 'viewer',
  invited_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX idx_workspace_users_workspace ON workspace_users(workspace_id);
CREATE INDEX idx_workspace_users_user ON workspace_users(user_id);

ALTER TABLE workspace_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspaces_select" ON workspaces
  FOR SELECT USING (
    id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );

CREATE POLICY "workspaces_insert" ON workspaces
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "workspaces_update" ON workspaces
  FOR UPDATE USING (
    id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "workspace_users_select" ON workspace_users
  FOR SELECT USING (
    user_id = auth.uid() OR
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );

CREATE POLICY "workspace_users_insert" ON workspace_users
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ) OR user_id = auth.uid()
  );
