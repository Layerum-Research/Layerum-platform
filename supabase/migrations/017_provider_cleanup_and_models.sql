-- Remove legacy Bedrock provider records before enum migration.
DELETE FROM model_configs
WHERE llm_model_id IN (
  SELECT id FROM model_definitions WHERE provider::text = 'aws_bedrock'
)
   OR embedding_model_id IN (
  SELECT id FROM model_definitions WHERE provider::text = 'aws_bedrock'
)
   OR reranker_model_id IN (
  SELECT id FROM model_definitions WHERE provider::text = 'aws_bedrock'
);

DELETE FROM provider_connections
WHERE provider::text = 'aws_bedrock';

DELETE FROM model_definitions
WHERE provider::text = 'aws_bedrock';

-- Replace provider enum to remove aws_bedrock and add qwen/kimi/deepseek.
ALTER TYPE provider_name RENAME TO provider_name_old;

CREATE TYPE provider_name AS ENUM (
  'openai', 'anthropic', 'cohere', 'google', 'mistral',
  'groq', 'together', 'azure_openai', 'qwen', 'kimi', 'deepseek', 'custom'
);

ALTER TABLE provider_connections
  ALTER COLUMN provider TYPE provider_name
  USING provider::text::provider_name;

ALTER TABLE model_definitions
  ALTER COLUMN provider TYPE provider_name
  USING provider::text::provider_name;

DROP TYPE provider_name_old;

-- Seed additional OpenAI-compatible providers and models.
INSERT INTO model_definitions (provider, provider_key, display_name, model_type, context_window, max_output, capabilities) VALUES
  ('qwen',     'qwen-plus',                  'Qwen Plus',                     'llm',       131072, 8192, ARRAY['chat']),
  ('qwen',     'qwen-max',                   'Qwen Max',                      'llm',       131072, 8192, ARRAY['chat']),
  ('qwen',     'text-embedding-v3',          'Qwen Text Embedding v3',        'embedding', NULL,   NULL, ARRAY['embedding']),
  ('kimi',     'kimi-k2-0905-preview',       'Kimi K2 0905 Preview',          'llm',       256000, 8192, ARRAY['chat']),
  ('deepseek', 'deepseek-chat',              'DeepSeek Chat',                 'llm',       128000, 8192, ARRAY['chat']),
  ('deepseek', 'deepseek-reasoner',          'DeepSeek Reasoner',             'llm',       128000, 8192, ARRAY['chat'])
ON CONFLICT (provider, provider_key) DO NOTHING;
