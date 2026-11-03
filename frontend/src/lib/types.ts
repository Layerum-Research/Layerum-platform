export type UUID = string;

export type Workspace = {
  id: UUID;
  name: string;
  slug: string;
  logo_url?: string | null;
  created_at?: string;
};

export type WorkspaceMembership = {
  role: 'owner' | 'admin' | 'editor' | 'viewer' | 'api_only';
  workspace: Workspace;
};

export type WorkspaceOverview = {
  account: {
    plan: {
      code: 'free' | 'pro' | 'enterprise' | string;
      name: string;
    };
    limits: {
      workspaceLimit: number;
      capacityBytes: number;
    };
    usage: {
      ownedWorkspaceCount: number;
      usedBytes: number;
      remainingBytes: number;
    };
  };
  items: Array<{
    role: WorkspaceMembership['role'];
    isOwner: boolean;
    workspace: Workspace;
    metrics: {
      members: number;
      entities: number;
      documents: number;
      chunks: number;
      usedBytes: number;
      capacityBytes: number | null;
      usagePercent: number | null;
    };
  }>;
};

export type WorkspaceMember = {
  id: UUID;
  role: 'owner' | 'admin' | 'editor' | 'viewer' | 'api_only';
  workspace_role_id?: UUID | null;
  isOwner?: boolean;
  roleDefinition?: WorkspaceRole | null;
  created_at: string;
  last_seen_at?: string | null;
  mfa_enabled: boolean;
  user: {
    id: UUID;
    email: string;
    full_name?: string | null;
    avatar_url?: string | null;
  };
};

export type WorkspaceInvite = {
  id: UUID;
  workspace_id: UUID;
  email: string;
  role_id: UUID;
  invited_by: UUID;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
  accepted_by?: UUID | null;
  accepted_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceRolePermission =
  | 'members.manage'
  | 'providers.manage'
  | 'models.manage'
  | 'data.manage'
  | 'query.run'
  | 'api_keys.manage'
  | 'audit.read';

export type WorkspaceRole = {
  id: UUID;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissions: WorkspaceRolePermission[];
  assignedCount: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type EntityType = {
  id: UUID;
  workspace_id: UUID;
  name: string;
  label: string;
};

export type Entity = {
  id: UUID;
  workspace_id: UUID;
  entity_type_id: UUID;
  name: string;
  description?: string | null;
  parent_id?: UUID | null;
  metadata?: Record<string, unknown> | null;
  path?: UUID[];
  depth?: number;
  entity_type?: EntityType;
  children?: Entity[];
};

export type ScopeResult = { entityIds: UUID[] };

export type DataSource = {
  id: UUID;
  workspace_id: UUID;
  entity_id: UUID;
  source_type: 'file' | 'url' | 'text' | 'api';
  display_name: string;
  source_url?: string | null;
  visibility: 'self' | 'self_and_descendants';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  metadata?: Record<string, unknown> & {
    model_config_id?: UUID;
    raw_text?: string;
    indexed_profile_version?: number;
    retrieval_profile_version?: number;
  };
  created_at: string;
  entity?: { id: UUID; name: string };
  ingestion_jobs?: Array<{
    id: UUID;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    steps_completed?: string[];
    error_message?: string | null;
    updated_at?: string;
    created_at?: string;
    metadata?: Record<string, unknown> | null;
  }>;
};

export type SourceErrorDetails = {
  sourceId: UUID;
  status: DataSource['status'];
  latestJob: {
    id: UUID;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    error_message?: string | null;
    steps_completed?: string[];
    updated_at?: string;
    created_at?: string;
    metadata?: Record<string, unknown> | null;
  };
};

export type ProviderConnection = {
  id: UUID;
  workspace_id: UUID;
  entity_id?: UUID | null;
  provider: string;
  display_name: string;
  key_preview?: string;
  provider_config?: Record<string, unknown> | null;
  is_active?: boolean;
  last_tested_at?: string | null;
  test_passed?: boolean | null;
  created_at?: string;
};

export type ModelDefinition = {
  id: UUID;
  provider: string;
  provider_key: string;
  display_name: string;
  model_type:
    // temporarily disabled: | 'reranker'
    'llm' | 'embedding' | 'speech';
  context_window?: number | null;
  max_output?: number | null;
  capabilities?: string[];
  family?: string | null;
  release_date?: string | null;
  pricing?: { input: number | null; output: number | null; cache_read: number | null } | null;
  catalog_status?: 'beta' | 'deprecated' | null;
};

export type ConfigModelRef = {
  id: UUID;
  provider: string;
  display_name: string;
  is_active?: boolean;
  capabilities?: string[] | null;
};

export type ModelConfig = {
  id: UUID;
  workspace_id: UUID;
  entity_id?: UUID | null;
  name: string;
  llm_model_id: UUID;
  embedding_model_id: UUID;
  // temporarily disabled: reranker_model_id?: UUID | null;
  provider_connection_id?: UUID | null;
  llm_provider_connection_id?: UUID | null;
  embedding_provider_connection_id?: UUID | null;
  system_prompt?: string | null;
  embedding_doc_prefix?: string | null;
  embedding_query_prefix?: string | null;
  temperature?: number;
  top_k?: number;
  chunk_strategy?: 'fixed' | 'sliding' | 'semantic';
  chunk_size?: number;
  chunk_overlap?: number;
  retrieval_profile_version?: number;
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
  llm?: ConfigModelRef;
  embedding?: ConfigModelRef;
};

export type QueryResponse = {
  answer: string;
  citations: Array<{
    index: number;
    chunk_id: UUID;
    document_id: UUID;
    document_title: string | null;
    excerpt: string;
    matchScoreRaw?: number;
  }>;
  meta?: {
    resolvedEntityIds: UUID[];
    topK: number;
    latencyMs: number;
    tokensUsed?: number;
    rawSystemPrompt?: string;
  };
};

export type UsageSummary = {
  totalQueries: number;
  totalTokens: number;
  totalDocuments: number;
  totalChunks: number;
  recentJobs: Array<{
    id: UUID;
    status: string;
    created_at: string;
  }>;
};

export type DashboardAnalytics = {
  days: number;
  granularity: 'hour' | 'day' | 'week';
  kpis: {
    totalQueries: number;
    totalDocuments: number;
    totalEntities: number;
    totalTokens: number;
  };
  performance: {
    avgLatencyMs: number;
    errorRatePct: number;
    throttledPct: number;
    peakLoadPerMin: number;
  };
  trend: Array<{
    bucketStart: string;
    queries: number;
    tokens: number;
  }>;
  timeseries: {
    latency: Array<{
      bucketStart: string;
      avgLatencyMs: number | null;
      sampleCount: number;
    }>;
    errorRate: Array<{
      bucketStart: string;
      errorRatePct: number | null;
      totalAttempts: number;
      failedAttempts: number;
    }>;
    throttledRate: Array<{
      bucketStart: string;
      throttledPct: number | null;
      failedAttempts: number;
      throttledAttempts: number;
    }>;
  };
  systemHealth: {
    percent: number;
    components: Array<{
      name: 'backend' | 'database' | 'qdrant' | 'redis';
      status: 'up' | 'down' | 'degraded' | 'not_configured';
      latencyMs: number | null;
      message: string | null;
    }>;
  };
  recentActivity: AuditLog[];
};

export type QueryLog = {
  id: UUID;
  query_text: string;
  answer_text: string;
  total_tokens?: number | null;
  latency_ms?: number | null;
  success: boolean;
  created_at: string;
};

export type WorkspaceApiKey = {
  id: UUID;
  workspace_id: UUID;
  name: string;
  capabilities: Array<
    'query:read' | 'data:ingest' | 'audit:read' | 'config:manage'
  >;
  key_prefix: string;
  last4: string;
  allowed_entity_ids: UUID[];
  allowed_model_config_ids: UUID[];
  rpm_limit: number | null;
  daily_token_limit: number | null;
  is_active: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditLog = {
  id: UUID;
  action: string;
  resource: string;
  resource_id?: UUID | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type AccountSession = {
  id: UUID;
  sessionId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  osName?: string | null;
  browserName?: string | null;
  deviceType?: string | null;
  deviceLabel?: string | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  revokedAt?: string | null;
  isCurrent: boolean;
};

export type OAuthCliToken = {
  id: UUID;
  name: string;
  client_id: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
};

export type AccountUser = {
  id: UUID;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  metadata?: Record<string, unknown> | null;
};

export const NOTIFICATION_TYPES = [
  'api_key_created',
  'api_key_revoked',
  'api_key_rotated',
  'api_key_token_usage_warning',
  'workspace_invite_accepted',
  'ingestion_failed',
  'storage_quota_warning',
  'storage_quota_reached',
  'system_health_down',
  'system_health_recovered',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export type NotificationPreferences = {
  system_health_in_app: boolean;
  system_health_email: boolean;
  api_usage_in_app: boolean;
  api_usage_email: boolean;
};

export type NotificationPayload = Record<string, string | number | null>;

export type AppNotification = {
  id: string;
  workspace_id: string | null;
  type: NotificationType;
  severity: NotificationSeverity;
  payload: NotificationPayload;
  created_at: string;
};
