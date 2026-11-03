CREATE TABLE workspace_roles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, name)
);

CREATE INDEX idx_workspace_roles_workspace ON workspace_roles(workspace_id);

CREATE TABLE workspace_role_permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id     UUID NOT NULL REFERENCES workspace_roles(id) ON DELETE CASCADE,
  permission  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role_id, permission)
);

CREATE INDEX idx_workspace_role_permissions_role ON workspace_role_permissions(role_id);

ALTER TABLE workspace_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_roles_select" ON workspace_roles
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id
      FROM workspace_users
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_roles_write" ON workspace_roles
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id
      FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "workspace_role_permissions_select" ON workspace_role_permissions
  FOR SELECT USING (
    role_id IN (
      SELECT id
      FROM workspace_roles
      WHERE workspace_id IN (
        SELECT workspace_id
        FROM workspace_users
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "workspace_role_permissions_write" ON workspace_role_permissions
  FOR ALL USING (
    role_id IN (
      SELECT id
      FROM workspace_roles
      WHERE workspace_id IN (
        SELECT workspace_id
        FROM workspace_users
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

ALTER TABLE workspace_users
  ADD COLUMN workspace_role_id UUID REFERENCES workspace_roles(id) ON DELETE SET NULL;

CREATE INDEX idx_workspace_users_workspace_role_id ON workspace_users(workspace_role_id);

INSERT INTO workspace_roles (workspace_id, name, description, is_system)
SELECT
  w.id,
  seed.name,
  seed.description,
  TRUE
FROM workspaces w
CROSS JOIN (
  VALUES
    ('Admin', 'Manage workspace settings and team permissions'),
    ('Editor', 'Manage models and data sources'),
    ('Viewer', 'Run queries and read workspace data'),
    ('Scoped', 'Restricted API-oriented access')
) AS seed(name, description)
ON CONFLICT (workspace_id, name) DO NOTHING;

INSERT INTO workspace_role_permissions (role_id, permission)
SELECT
  r.id,
  seed.permission
FROM workspace_roles r
JOIN (
  VALUES
    ('Admin', 'members.manage'),
    ('Admin', 'providers.manage'),
    ('Admin', 'models.manage'),
    ('Admin', 'data.manage'),
    ('Admin', 'query.run'),
    ('Admin', 'api_keys.manage'),
    ('Admin', 'audit.read'),
    ('Editor', 'models.manage'),
    ('Editor', 'data.manage'),
    ('Editor', 'query.run'),
    ('Viewer', 'query.run'),
    ('Scoped', 'query.run')
) AS seed(role_name, permission) ON seed.role_name = r.name
ON CONFLICT (role_id, permission) DO NOTHING;

UPDATE workspace_users u
SET workspace_role_id = r.id
FROM workspace_roles r
WHERE u.workspace_id = r.workspace_id
  AND u.role <> 'owner'
  AND (
    (u.role = 'admin' AND r.name = 'Admin') OR
    (u.role = 'editor' AND r.name = 'Editor') OR
    (u.role = 'viewer' AND r.name = 'Viewer') OR
    (u.role = 'api_only' AND r.name = 'Scoped')
  );
