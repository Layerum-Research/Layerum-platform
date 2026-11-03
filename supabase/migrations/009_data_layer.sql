CREATE TABLE data_sources (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_id      UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  source_type    data_source_type NOT NULL,
  display_name   TEXT NOT NULL,
  source_url     TEXT,
  storage_path   TEXT,
  mime_type      TEXT,
  file_size      BIGINT,
  checksum       TEXT,
  visibility     visibility_mode NOT NULL DEFAULT 'self_and_descendants',
  status         ingestion_status NOT NULL DEFAULT 'pending',
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_sources_workspace ON data_sources(workspace_id);
CREATE INDEX idx_data_sources_entity ON data_sources(entity_id);
CREATE INDEX idx_data_sources_status ON data_sources(status);

ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "data_sources_select" ON data_sources
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );

CREATE POLICY "data_sources_insert" ON data_sources
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY "data_sources_update" ON data_sources
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY "data_sources_delete" ON data_sources
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE TABLE documents (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_id      UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  data_source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  title          TEXT,
  mime_type      TEXT,
  storage_path   TEXT,
  checksum       TEXT,
  char_count     INTEGER,
  status         ingestion_status NOT NULL DEFAULT 'pending',
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_workspace ON documents(workspace_id);
CREATE INDEX idx_documents_entity ON documents(entity_id);
CREATE INDEX idx_documents_data_source ON documents(data_source_id);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select" ON documents
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );

CREATE TABLE document_chunks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_id        UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  document_id      UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index      INTEGER NOT NULL,
  content          TEXT NOT NULL,
  token_count      INTEGER,
  embedding_status embedding_status NOT NULL DEFAULT 'pending',
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_chunks_entity ON document_chunks(entity_id);
CREATE INDEX idx_chunks_workspace ON document_chunks(workspace_id);
CREATE INDEX idx_chunks_embedding_status ON document_chunks(embedding_status);

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_chunks_select" ON document_chunks
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );

CREATE TABLE vector_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_id        UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  vector_provider TEXT NOT NULL DEFAULT 'qdrant',
  collection_name TEXT NOT NULL,
  vector_point_id TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chunk_id, vector_provider, collection_name)
);

CREATE INDEX idx_vector_records_workspace ON vector_records(workspace_id);
CREATE INDEX idx_vector_records_entity ON vector_records(entity_id);
CREATE INDEX idx_vector_records_chunk ON vector_records(chunk_id);

ALTER TABLE vector_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vector_records_select" ON vector_records
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );
