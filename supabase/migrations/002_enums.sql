CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'editor', 'viewer', 'api_only');
CREATE TYPE visibility_mode AS ENUM ('self', 'self_and_descendants');
CREATE TYPE data_source_type AS ENUM ('file', 'url', 'text', 'api');
CREATE TYPE ingestion_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE embedding_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE model_type AS ENUM ('llm', 'embedding', 'reranker', 'speech');
CREATE TYPE provider_name AS ENUM (
  'openai', 'anthropic', 'cohere', 'google', 'mistral',
  'groq', 'together', 'azure_openai', 'qwen', 'kimi', 'deepseek', 'custom'
);
CREATE TYPE audit_action AS ENUM (
  'create', 'update', 'delete', 'read',
  'login', 'logout', 'key_rotation', 'query', 'upload'
);
