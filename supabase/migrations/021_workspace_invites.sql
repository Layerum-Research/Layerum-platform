CREATE TABLE workspace_invites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role_id     UUID NOT NULL REFERENCES workspace_roles(id) ON DELETE RESTRICT,
  invited_by  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token       TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspace_invites_workspace_status
  ON workspace_invites(workspace_id, status, created_at DESC);

CREATE INDEX idx_workspace_invites_email
  ON workspace_invites(workspace_id, email);

CREATE UNIQUE INDEX uq_workspace_invites_pending_email
  ON workspace_invites(workspace_id, email)
  WHERE status = 'pending';

ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_invites_select" ON workspace_invites
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_invites_insert" ON workspace_invites
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "workspace_invites_update" ON workspace_invites
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE TRIGGER trg_workspace_invites_updated_at
  BEFORE UPDATE ON workspace_invites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
