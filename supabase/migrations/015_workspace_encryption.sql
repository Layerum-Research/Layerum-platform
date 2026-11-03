CREATE TABLE workspace_encryption_keys (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dek_version   INTEGER NOT NULL,
  provider      TEXT NOT NULL CHECK (provider IN ('aws_kms', 'local_vault')),
  encrypted_dek TEXT NOT NULL,
  dek_iv        TEXT,
  dek_tag       TEXT,
  kms_key_id    TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, dek_version)
);

CREATE INDEX idx_workspace_encryption_keys_workspace
  ON workspace_encryption_keys(workspace_id);

CREATE INDEX idx_workspace_encryption_keys_status
  ON workspace_encryption_keys(workspace_id, status);

ALTER TABLE workspace_encryption_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_encryption_keys_select" ON workspace_encryption_keys
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "workspace_encryption_keys_insert" ON workspace_encryption_keys
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "workspace_encryption_keys_update" ON workspace_encryption_keys
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE TRIGGER trg_workspace_encryption_keys_updated_at
  BEFORE UPDATE ON workspace_encryption_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE workspace_api_keys
  ADD COLUMN capabilities TEXT[] NOT NULL DEFAULT ARRAY['query:read'];

ALTER TABLE document_chunks
  ADD COLUMN content_ciphertext TEXT,
  ADD COLUMN content_iv TEXT,
  ADD COLUMN content_tag TEXT,
  ADD COLUMN enc_version INTEGER,
  ADD COLUMN is_encrypted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_document_chunks_is_encrypted
  ON document_chunks(is_encrypted);
