CREATE TABLE model_definitions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider         provider_name NOT NULL,
  provider_key     TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  model_type       model_type NOT NULL,
  context_window   INTEGER,
  max_output       INTEGER,
  capabilities     TEXT[] NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_key)
);

CREATE INDEX idx_model_definitions_provider ON model_definitions(provider);
CREATE INDEX idx_model_definitions_type ON model_definitions(model_type);

CREATE TABLE model_configs (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id           UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_id              UUID REFERENCES entities(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  llm_model_id           UUID NOT NULL REFERENCES model_definitions(id),
  embedding_model_id     UUID NOT NULL REFERENCES model_definitions(id),
  reranker_model_id      UUID REFERENCES model_definitions(id),
  provider_connection_id UUID REFERENCES provider_connections(id) ON DELETE SET NULL,
  system_prompt          TEXT,
  temperature            NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  top_k                  INTEGER NOT NULL DEFAULT 8,
  chunk_size             INTEGER NOT NULL DEFAULT 512,
  chunk_overlap          INTEGER NOT NULL DEFAULT 64,
  retrieval_settings     JSONB NOT NULL DEFAULT '{}',
  is_default             BOOLEAN NOT NULL DEFAULT FALSE,
  created_by             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_model_configs_workspace ON model_configs(workspace_id);
CREATE INDEX idx_model_configs_entity ON model_configs(entity_id);

ALTER TABLE model_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "model_configs_select" ON model_configs
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );

CREATE POLICY "model_configs_insert" ON model_configs
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY "model_configs_update" ON model_configs
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY "model_configs_delete" ON model_configs
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

INSERT INTO model_definitions (provider, provider_key, display_name, model_type, context_window, max_output, capabilities) VALUES
  ('openai',    'gpt-4o',                    'GPT-4o',                    'llm',       128000, 16384, ARRAY['chat','function_calling','vision']),
  ('openai',    'gpt-4.1',                   'GPT-4.1',                   'llm',       1047576, 32768, ARRAY['chat','function_calling','vision']),
  ('openai',    'gpt-4o-mini',               'GPT-4o Mini',               'llm',       128000, 16384, ARRAY['chat','function_calling']),
  ('anthropic', 'claude-sonnet-4-6',         'Claude Sonnet 4.6',         'llm',       200000, 64000, ARRAY['chat','vision']),
  ('anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5',          'llm',       200000, 16000, ARRAY['chat']),
  ('openai',    'text-embedding-3-small',    'text-embedding-3-small',    'embedding', NULL,   NULL,  ARRAY['embedding']),
  ('openai',    'text-embedding-3-large',    'text-embedding-3-large',    'embedding', NULL,   NULL,  ARRAY['embedding']),
  ('openai',    'text-embedding-ada-002',    'text-embedding-ada-002',    'embedding', NULL,   NULL,  ARRAY['embedding']);
