export type UUID = string;

export type Visibility = "self" | "self_and_descendants";

export type RequestMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type Entity = {
  id: UUID;
  parentId?: UUID | null;
  parent_id?: UUID | null;
  entityTypeId?: UUID | null;
  entity_type_id?: UUID | null;
  name: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  depth?: number;
  children?: Entity[];
};

export type EntityType = {
  id: UUID;
  name: string;
  label: string;
};

export type DataSource = {
  id: UUID;
  entityId: UUID;
  entity_id?: UUID;
  sourceType: "file" | "url" | "text" | "api";
  source_type?: "file" | "url" | "text" | "api";
  displayName: string;
  display_name?: string;
  visibility: Visibility;
  status: "pending" | "processing" | "completed" | "failed";
  mimeType?: string | null;
  mime_type?: string | null;
  fileSize?: number | null;
  file_size?: number | null;
  createdAt: string;
  created_at?: string;
  updatedAt: string;
  updated_at?: string;
};

export type SourceErrorDetails = {
  sourceId: UUID;
  status: DataSource["status"];
  latestJob: {
    id: UUID;
    status: "pending" | "processing" | "completed" | "failed";
    error_message?: string | null;
    steps_completed?: string[];
    updated_at?: string;
    created_at?: string;
    metadata?: Record<string, unknown> | null;
  };
};

export type ModelDefinition = {
  id: UUID;
  provider: string;
  provider_key: string;
  display_name: string;
  model_type: "llm" | "embedding" | "reranker" | "speech";
  context_window?: number | null;
  max_output?: number | null;
  capabilities?: string[];
};

export type ModelConfig = {
  id: UUID;
  workspaceId?: UUID;
  entityId?: UUID | null;
  entity_id?: UUID | null;
  name: string;
  llmModelId?: UUID;
  embeddingModelId?: UUID;
  providerConnectionId?: UUID | null;
  llmProviderConnectionId?: UUID | null;
  embeddingProviderConnectionId?: UUID | null;
  systemPrompt?: string | null;
  embeddingDocPrefix?: string | null;
  embeddingQueryPrefix?: string | null;
  chunkStrategy?: "fixed" | "sliding" | "semantic" | null;
  temperature?: number | null;
  topK?: number | null;
  chunkSize?: number | null;
  chunkOverlap?: number | null;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
  llm?: { id: UUID; provider: string; displayName: string } | null;
  embedding?: { id: UUID; provider: string; displayName: string } | null;
};

export type ProviderConnection = {
  id: UUID;
  workspaceId?: UUID;
  entityId?: UUID | null;
  provider: string;
  displayName: string;
  keyPreview?: string | null;
  providerConfig?: Record<string, unknown> | null;
  isActive?: boolean;
  lastTestedAt?: string | null;
  testPassed?: boolean | null;
  createdAt?: string | null;
};

export type CreateProviderInput = {
  provider:
    | "openai"
    | "anthropic"
    | "cohere"
    | "google"
    | "mistral"
    | "groq"
    | "together"
    | "azure_openai"
    | "qwen"
    | "kimi"
    | "deepseek"
    | "custom";
  displayName: string;
  apiKey: string;
  entityId?: UUID;
  providerConfig?: Record<string, unknown>;
};

export type CreateModelConfigInput = {
  name: string;
  llmModelId: UUID;
  embeddingModelId: UUID;
  providerConnectionId?: UUID;
  llmProviderConnectionId?: UUID;
  embeddingProviderConnectionId?: UUID;
  entityId?: UUID;
  systemPrompt?: string;
  embeddingDocPrefix?: string;
  embeddingQueryPrefix?: string;
  temperature?: number;
  topK?: number;
  chunkStrategy?: "fixed" | "sliding" | "semantic";
  chunkSize?: number;
  chunkOverlap?: number;
  isDefault?: boolean;
};

export type UpdateModelConfigInput = {
  name?: string;
  llmModelId?: UUID;
  embeddingModelId?: UUID;
  providerConnectionId?: UUID;
  llmProviderConnectionId?: UUID;
  embeddingProviderConnectionId?: UUID;
  entityId?: UUID;
  systemPrompt?: string;
  embeddingDocPrefix?: string;
  embeddingQueryPrefix?: string;
  temperature?: number;
  topK?: number;
  chunkStrategy?: "fixed" | "sliding" | "semantic";
  chunkSize?: number;
  chunkOverlap?: number;
  isDefault?: boolean;
};

export type QueryResponse = {
  answer: string;
  citations: Array<{
    index: number;
    documentTitle: string | null;
    document_title?: string | null;
    chunk_id?: UUID;
    document_id?: UUID;
    excerpt: string;
    matchScoreRaw?: number;
  }>;
  meta?: {
    resolvedEntityIds: UUID[];
    topK: number;
    latencyMs: number;
    tokensUsed?: number;
  };
};

export type LayerumClientOptions = {
  apiKey: string;
  /**
   * @deprecated Workspace is resolved from lyr_wk_* API key.
   */
  workspaceId?: UUID;
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
};

export type UploadFileInput =
  | Blob
  | File
  | Buffer
  | Uint8Array
  | ArrayBuffer;

export type CreateEntityInput = {
  entityTypeId: UUID;
  name: string;
  description?: string;
  parentId?: UUID;
  metadata?: Record<string, unknown>;
};

export type CreateEntityTypeInput = {
  name: string;
  label: string;
};

export type ListSourcesInput = {
  entityId: UUID;
  allInWorkspace?: boolean;
};

export type UploadDocumentInput = {
  entityId: UUID;
  file: UploadFileInput;
  fileName: string;
  contentType?: string;
  visibility?: Visibility;
  modelConfigId?: UUID;
};

export type UploadInitInput = {
  entityId: UUID;
  fileName: string;
  fileSizeBytes: number;
  contentType?: string;
  visibility?: Visibility;
  modelConfigId?: UUID;
};

export type UploadInitResponse = {
  uploadId: UUID;
  objectKey: string;
  uploadUrl: string;
  method: "POST";
  fields: Record<string, string>;
  expiresInSeconds: number;
};

export type CreateTextDocumentInput = {
  entityId: UUID;
  displayName: string;
  rawText: string;
  visibility?: Visibility;
  modelConfigId?: UUID;
};

export type CreateUrlDocumentInput = {
  entityId: UUID;
  displayName: string;
  sourceUrl: string;
  visibility?: Visibility;
  modelConfigId?: UUID;
};

export type DeleteDocumentInput = {
  entityId: UUID;
  sourceId: UUID;
};

export type WaitUntilReadyInput = {
  entityId: UUID;
  sourceId: UUID;
  timeoutMs?: number;
  intervalMs?: number;
};

export type QueryInput = {
  entityId: UUID;
  modelConfigId: UUID;
  query: string;
  topK?: number;
  includeParentScopes?: boolean;
};

export type ListModelDefinitionsInput = {
  type?: string;
};
