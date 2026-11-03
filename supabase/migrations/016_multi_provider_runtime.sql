ALTER TABLE provider_connections
  ADD COLUMN IF NOT EXISTS provider_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE model_configs
  ADD COLUMN IF NOT EXISTS llm_provider_connection_id UUID REFERENCES provider_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS embedding_provider_connection_id UUID REFERENCES provider_connections(id) ON DELETE SET NULL;

UPDATE model_configs
SET
  llm_provider_connection_id = COALESCE(llm_provider_connection_id, provider_connection_id),
  embedding_provider_connection_id = COALESCE(embedding_provider_connection_id, provider_connection_id)
WHERE provider_connection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_model_configs_llm_provider_conn
  ON model_configs(llm_provider_connection_id);

CREATE INDEX IF NOT EXISTS idx_model_configs_embedding_provider_conn
  ON model_configs(embedding_provider_connection_id);

-- Additional provider models (LLM + embeddings) for multi-provider runtime.
INSERT INTO model_definitions (provider, provider_key, display_name, model_type, context_window, max_output, capabilities) VALUES
  ('anthropic', 'claude-3-7-sonnet-latest',      'Claude 3.7 Sonnet',                 'llm',       200000, 64000, ARRAY['chat','vision']),
  ('cohere',    'command-r-plus',                'Cohere Command R+',                 'llm',       128000, 4096,  ARRAY['chat']),
  ('cohere',    'command-r',                     'Cohere Command R',                  'llm',       128000, 4096,  ARRAY['chat']),
  ('cohere',    'embed-english-v3.0',            'Cohere Embed English v3',           'embedding', NULL,   NULL,  ARRAY['embedding']),
  ('cohere',    'embed-multilingual-v3.0',       'Cohere Embed Multilingual v3',      'embedding', NULL,   NULL,  ARRAY['embedding']),
  ('google',    'gemini-2.5-flash',              'Gemini 2.5 Flash',                  'llm',       1000000, 8192, ARRAY['chat','vision']),
  ('google',    'gemini-2.5-pro',                'Gemini 2.5 Pro',                    'llm',       1000000, 8192, ARRAY['chat','vision']),
  ('google',    'gemini-embedding-001',          'Gemini Embedding 001',              'embedding', NULL,   NULL,  ARRAY['embedding']),
  ('mistral',   'mistral-large-latest',          'Mistral Large Latest',              'llm',       128000, 8192, ARRAY['chat']),
  ('mistral',   'mistral-small-latest',          'Mistral Small Latest',              'llm',       128000, 8192, ARRAY['chat']),
  ('mistral',   'mistral-embed',                 'Mistral Embed',                     'embedding', NULL,   NULL, ARRAY['embedding']),
  ('groq',      'llama-3.3-70b-versatile',       'Groq Llama 3.3 70B Versatile',      'llm',       131072, 8192, ARRAY['chat']),
  ('together',  'meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Together Llama 3.3 70B Instruct', 'llm', 131072, 8192, ARRAY['chat']),
  ('together',  'togethercomputer/m2-bert-80M-8k-retrieval', 'Together M2 BERT Retrieval', 'embedding', NULL, NULL, ARRAY['embedding']),
  ('azure_openai', 'gpt-4.1',                    'Azure OpenAI GPT-4.1',              'llm',       1047576, 32768, ARRAY['chat','function_calling','vision']),
  ('azure_openai', 'text-embedding-3-large',     'Azure OpenAI text-embedding-3-large','embedding', NULL,   NULL, ARRAY['embedding']),
  ('qwen', 'qwen-plus',                           'Qwen Plus',                          'llm',       131072, 8192, ARRAY['chat']),
  ('qwen', 'qwen-max',                            'Qwen Max',                           'llm',       131072, 8192, ARRAY['chat']),
  ('qwen', 'text-embedding-v3',                   'Qwen Text Embedding v3',             'embedding', NULL,   NULL, ARRAY['embedding']),
  ('kimi', 'kimi-k2-0905-preview',                'Kimi K2 0905 Preview',               'llm',       256000, 8192, ARRAY['chat']),
  ('deepseek', 'deepseek-chat',                   'DeepSeek Chat',                      'llm',       128000, 8192, ARRAY['chat']),
  ('deepseek', 'deepseek-reasoner',               'DeepSeek Reasoner',                  'llm',       128000, 8192, ARRAY['chat'])
ON CONFLICT (provider, provider_key) DO NOTHING;
