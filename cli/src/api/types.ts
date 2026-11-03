export type Me = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  metadata: Record<string, unknown>;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  created_at: string;
};

export type WorkspaceMembership = { role: string; workspace: Workspace };

export type EntityTypeRef = { id: string; name: string; label: string };

export type Entity = {
  id: string;
  workspace_id: string;
  entity_type_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  path: string[];
  depth: number;
  created_at: string;
  updated_at: string;
  entity_type: EntityTypeRef | null;
};

export type EntityNode = Entity & { children: EntityNode[] };

export type ModelDefinitionRef = {
  id: string;
  provider: string;
  display_name: string;
  is_active: boolean;
};

export type ModelConfig = {
  id: string;
  workspace_id: string;
  entity_id: string | null;
  name: string;
  top_k: number;
  is_default: boolean;
  llm: ModelDefinitionRef | null;
  embedding: ModelDefinitionRef | null;
};

export type IngestionStatus = "pending" | "processing" | "completed" | "failed";

export type IngestionJob = {
  id: string;
  status: IngestionStatus;
  steps_completed: unknown;
  error_message: string | null;
  updated_at: string;
  created_at: string;
  metadata: unknown;
};

export type DataSource = {
  id: string;
  workspace_id: string;
  entity_id: string;
  source_type: "file" | "url" | "text" | "api";
  display_name: string;
  status: IngestionStatus;
  visibility: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
  entity?: { id: string; name: string };
  ingestion_jobs?: IngestionJob[];
};

export type DataSourceError = {
  sourceId: string;
  status: IngestionStatus;
  latestJob: IngestionJob;
};

export type UploadInit = {
  uploadId: string;
  objectKey: string;
  uploadUrl: string;
  method: "POST";
  fields: Record<string, string>;
  expiresInSeconds: number;
};

export type QueryCitation = {
  index: number;
  chunk_id: string;
  document_id: string;
  document_title: string | null;
  excerpt: string;
  matchScoreRaw?: number;
};

export type QueryResult = {
  answer: string;
  citations: QueryCitation[];
};
