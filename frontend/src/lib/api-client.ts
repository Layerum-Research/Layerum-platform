import { env } from './env';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';
import type {
  AppNotification,
  NotificationPreferences,
  AuditLog,
  DashboardAnalytics,
  DataSource,
  Entity,
  EntityType,
  ModelConfig,
  ModelDefinition,
  ProviderConnection,
  QueryLog,
  QueryResponse,
  ScopeResult,
  SourceErrorDetails,
  WorkspaceRole,
  WorkspaceRolePermission,
  UsageSummary,
  Workspace,
  AccountSession,
  OAuthCliToken,
  WorkspaceApiKey,
  WorkspaceMember,
  WorkspaceMembership,
  WorkspaceOverview,
  WorkspaceInvite,
  AccountUser,
} from './types';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  path?: string;
  method?: string;

  constructor(
    message: string,
    status: number,
    details?: unknown,
    method?: string,
    path?: string,
  ) {
    super(message);
    this.status = status;
    this.details = details;
    this.method = method;
    this.path = path;
  }
}

type RequestOptions = {
  token: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  isFormData?: boolean;
  signOutOnUnauthorized?: boolean;
};

type UploadInitResponse = {
  uploadId: string;
  objectKey: string;
  uploadUrl: string;
  method: 'POST';
  fields: Record<string, string>;
  expiresInSeconds: number;
  visibility: 'self' | 'self_and_descendants';
  modelConfigId: string | null;
};

type FeedbackRequestBody = {
  name: string;
  email: string;
  message: string;
  categories?: string[];
  context?: string;
  page?: string;
};

type PasswordAuthResponse = {
  user: User | null;
  session: Session | null;
  sessionCreated?: boolean;
  needsEmailConfirmation?: boolean;
};

function normalizeErrorMessage(payload: unknown, status: number) {
  const fallback = `Request failed (${status})`;
  if (!payload || typeof payload !== 'object') return fallback;

  const maybeMessage = (payload as { message?: unknown }).message;
  if (Array.isArray(maybeMessage)) {
    return maybeMessage
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .join(', ');
  }
  if (typeof maybeMessage === 'string') return maybeMessage;
  if (maybeMessage && typeof maybeMessage === 'object') {
    const nested = (maybeMessage as { message?: unknown }).message;
    if (typeof nested === 'string') return nested;
    return JSON.stringify(maybeMessage);
  }

  return fallback;
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const method = options.method ?? 'GET';
  let res: Response;
  try {
    res = await fetch(`${env.apiBaseUrl}${path}`, {
      method,
      headers: options.isFormData
        ? { Authorization: `Bearer ${options.token}` }
        : {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.token}`,
          },
      body: options.body
        ? options.isFormData
          ? (options.body as BodyInit)
          : JSON.stringify(options.body)
        : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    const enriched = `Network error while ${method} ${path}: ${message}`;
    console.error('[api-client] network-error', {
      method,
      path,
      message,
      error,
    });
    throw new ApiError(enriched, 0, error, method, path);
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as
      | { message?: unknown; details?: unknown }
      | null;
    const message = normalizeErrorMessage(payload, res.status);
    if (options.signOutOnUnauthorized && path === '/auth/me' && res.status === 401) {
      await supabase.auth.signOut({ scope: 'local' });
    }
    console.error('[api-client] http-error', {
      method,
      path,
      status: res.status,
      message,
      details: payload?.details,
    });
    throw new ApiError(message, res.status, payload?.details, method, path);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function publicPost<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    throw new ApiError(`Network error while POST ${path}: ${message}`, 0, error, 'POST', path);
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as
      | { message?: unknown; details?: unknown }
      | null;
    const message = normalizeErrorMessage(payload, res.status);
    throw new ApiError(message, res.status, payload?.details, 'POST', path);
  }

  return (await res.json()) as T;
}

async function postPresigned(
  uploadUrl: string,
  file: File,
  fields?: Record<string, string>,
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields ?? {})) {
    form.append(key, value);
  }
  form.append('file', file);

  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: 'POST',
      body: form,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    throw new ApiError(
      `Network error while uploading to presigned URL: ${message}`,
      0,
      error,
      'POST',
      uploadUrl,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(
      `Presigned upload failed (${res.status})`,
      res.status,
      body || undefined,
      'POST',
      uploadUrl,
    );
  }
}

export const api = {
  signInWithPassword: (body: { email: string; password: string }) =>
    publicPost<PasswordAuthResponse>('/auth/signin', body),
  signUpWithPassword: (body: {
    email: string;
    password: string;
    fullName: string;
  }) => publicPost<PasswordAuthResponse>('/auth/signup', body),
  forgotPassword: (email: string) =>
    publicPost<{ success: boolean }>('/auth/forgot-password', { email }),
  me: (token: string) =>
    request<AccountUser>('/auth/me', {
      token,
      signOutOnUnauthorized: true,
    }),
  updateProfile: (
    token: string,
    body: { full_name?: string | null; email?: string },
  ) =>
    request<AccountUser>('/auth/me', {
      token,
      method: 'PATCH',
      body,
    }),
  updateAvatar: (token: string, file: File) => {
    const body = new FormData();
    body.append('avatar', file);
    return request<{
      success: boolean;
      avatar_url: string | null;
      avatar_path: string | null;
    }>('/auth/avatar', {
      token,
      method: 'POST',
      body,
      isFormData: true,
    });
  },
  deleteAccount: (token: string) =>
    request<{ success: boolean }>('/auth/account', {
      token,
      method: 'DELETE',
    }),
  logout: (token: string) =>
    request<{ success: boolean; revokedSessionId: string | null }>(
      '/auth/logout',
      {
        token,
        method: 'POST',
      },
    ),
  listSessions: (token: string) =>
    request<{ items: AccountSession[] }>('/auth/sessions', { token }),
  revokeSession: (token: string, sessionId: string) =>
    request<{ success: boolean; revokedSessionId: string; revokedCurrentSession: boolean }>(
      `/auth/sessions/${sessionId}`,
      {
        token,
        method: 'DELETE',
      },
    ),
  authorizeOAuthClient: (
    token: string,
    body: {
      client_id: string;
      redirect_uri: string;
      code_challenge: string;
      code_challenge_method: 'S256';
      state: string;
    },
  ) =>
    request<{ redirect_url: string | null; code: string | null }>('/oauth/authorize', {
      token,
      method: 'POST',
      body,
    }),
  listOAuthTokens: (token: string) =>
    request<{ items: OAuthCliToken[] }>('/oauth/tokens', { token }),
  revokeOAuthToken: (token: string, id: string) =>
    request<{ success: boolean }>(`/oauth/tokens/${id}`, {
      token,
      method: 'DELETE',
    }),
  getMfaStatus: (token: string) =>
    request<{
      enrolled: boolean;
      factors: Array<{
        id: string;
        friendlyName: string | null;
        factorType: string;
        status: string;
        createdAt: string;
        lastChallengedAt: string | null;
      }>;
      dismissedAt: string | null;
    }>('/auth/mfa/status', { token }),
  dismissMfa: (token: string) =>
    request<{ success: boolean; dismissedAt: string }>('/auth/mfa/dismiss', {
      token,
      method: 'POST',
    }),
  deleteMfaFactor: (token: string, factorId: string) =>
    request<{ success: boolean; factorId: string }>(
      `/auth/mfa/${encodeURIComponent(factorId)}`,
      { token, method: 'DELETE' },
    ),
  requestMfaRecovery: (email: string) =>
    publicPost<{ success: boolean }>('/auth/mfa/recovery/request', { email }),
  confirmMfaRecovery: (recoveryToken: string) =>
    publicPost<{ success: boolean }>('/auth/mfa/recovery/confirm', {
      token: recoveryToken,
    }),

  listWorkspaces: (token: string) =>
    request<WorkspaceMembership[]>('/workspaces', { token }),
  workspacesOverview: (token: string) =>
    request<WorkspaceOverview>('/workspaces/overview', { token }),
  submitFeedbackRequest: (body: FeedbackRequestBody) =>
    publicPost<{ success: boolean }>('/feedback-requests', body),
  createWorkspace: (
    token: string,
    body: { name: string; slug: string; logo_url?: string },
  ) => request<Workspace>('/workspaces', { token, method: 'POST', body }),
  deleteWorkspace: (token: string, workspaceId: string) =>
    request<{ success: boolean }>(`/workspaces/${workspaceId}`, {
      token,
      method: 'DELETE',
    }),
  getWorkspace: (token: string, workspaceId: string) =>
    request<Workspace>(`/workspaces/${workspaceId}`, { token }),
  getWorkspaceMembers: (token: string, workspaceId: string) =>
    request<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`, { token }),
  inviteMember: (
    token: string,
    workspaceId: string,
    body: { email: string; roleId: string },
  ) =>
    request<{ success: boolean; inviteId?: string; expiresAt?: string }>(`/workspaces/${workspaceId}/members`, {
      token,
      method: 'POST',
      body,
    }),
  listWorkspaceInvites: (token: string, workspaceId: string) =>
    request<WorkspaceInvite[]>(`/workspaces/${workspaceId}/invites`, { token }),
  revokeWorkspaceInvite: (token: string, workspaceId: string, inviteId: string) =>
    request<{ success: boolean }>(`/workspaces/${workspaceId}/invites/${inviteId}`, {
      token,
      method: 'DELETE',
    }),
  resendWorkspaceInvite: (token: string, workspaceId: string, inviteId: string) =>
    request<{ success: boolean; inviteId: string; expiresAt: string }>(
      `/workspaces/${workspaceId}/invites/${inviteId}/resend`,
      {
        token,
        method: 'POST',
      },
    ),
  acceptWorkspaceInvite: (token: string, tokenValue: string) =>
    request<{ success: boolean; workspaceId: string }>(`/workspaces/invites/${tokenValue}/accept`, {
      token,
      method: 'POST',
    }),
  listWorkspaceRoles: (token: string, workspaceId: string) =>
    request<WorkspaceRole[]>(`/workspaces/${workspaceId}/roles`, { token }),
  createWorkspaceRole: (
    token: string,
    workspaceId: string,
    body: {
      name: string;
      description?: string;
      permissions: WorkspaceRolePermission[];
    },
  ) =>
    request<WorkspaceRole>(`/workspaces/${workspaceId}/roles`, {
      token,
      method: 'POST',
      body,
    }),
  updateWorkspaceRole: (
    token: string,
    workspaceId: string,
    roleId: string,
    body: {
      name?: string;
      description?: string;
      permissions?: WorkspaceRolePermission[];
    },
  ) =>
    request<WorkspaceRole>(`/workspaces/${workspaceId}/roles/${roleId}`, {
      token,
      method: 'PATCH',
      body,
    }),
  deleteWorkspaceRole: (token: string, workspaceId: string, roleId: string) =>
    request<{ success: boolean }>(`/workspaces/${workspaceId}/roles/${roleId}`, {
      token,
      method: 'DELETE',
    }),
  removeMember: (token: string, workspaceId: string, userId: string) =>
    request<{ success: boolean }>(`/workspaces/${workspaceId}/members/${userId}`, {
      token,
      method: 'DELETE',
    }),

  listEntityTypes: (token: string, workspaceId: string) =>
    request<EntityType[]>(`/workspaces/${workspaceId}/entity-types`, { token }),
  createEntityType: (
    token: string,
    workspaceId: string,
    body: { name: string; label: string },
  ) =>
    request<EntityType>(`/workspaces/${workspaceId}/entity-types`, {
      token,
      method: 'POST',
      body,
    }),

  listEntities: (token: string, workspaceId: string, parentId?: string) =>
    request<Entity[]>(
      `/workspaces/${workspaceId}/entities${parentId ? `?parentId=${parentId}` : ''}`,
      { token },
    ),
  listEntityTree: (token: string, workspaceId: string) =>
    request<Entity[]>(`/workspaces/${workspaceId}/entities/tree`, { token }),
  createEntity: (
    token: string,
    workspaceId: string,
    body: {
      entity_type_id: string;
      name: string;
      description?: string;
      parent_id?: string;
      metadata?: Record<string, unknown>;
    },
  ) =>
    request<Entity>(`/workspaces/${workspaceId}/entities`, {
      token,
      method: 'POST',
      body,
    }),
  deleteEntity: (token: string, workspaceId: string, entityId: string) =>
    request<{ success: boolean }>(`/workspaces/${workspaceId}/entities/${entityId}`, {
      token,
      method: 'DELETE',
    }),
  getEntityScope: (token: string, workspaceId: string, entityId: string) =>
    request<ScopeResult>(`/workspaces/${workspaceId}/entities/${entityId}/scope`, {
      token,
    }),

  listSourcesForEntity: (token: string, workspaceId: string, entityId: string) =>
    request<DataSource[]>(`/workspaces/${workspaceId}/entities/${entityId}/sources`, {
      token,
    }),
  listSourcesAll: (token: string, workspaceId: string, entityIdForRoute: string) =>
    request<DataSource[]>(`/workspaces/${workspaceId}/entities/${entityIdForRoute}/sources/all`, {
      token,
    }),
  createSource: (
    token: string,
    workspaceId: string,
    entityId: string,
    body: {
      source_type: 'file' | 'url' | 'text' | 'api';
      display_name: string;
      source_url?: string;
      raw_text?: string;
      visibility?: 'self' | 'self_and_descendants';
      model_config_id?: string;
    },
  ) =>
    request<DataSource>(`/workspaces/${workspaceId}/entities/${entityId}/sources`, {
      token,
      method: 'POST',
      body,
    }),
  uploadSource: (
    token: string,
    workspaceId: string,
    entityId: string,
    file: File,
    visibility: 'self' | 'self_and_descendants',
    modelConfigId?: string,
  ) =>
    (async () => {
      const initialized = await request<UploadInitResponse>(
        `/workspaces/${workspaceId}/entities/${entityId}/sources/upload/init`,
        {
          token,
          method: 'POST',
          body: {
            file_name: file.name,
            file_size_bytes: file.size,
            content_type: file.type || 'application/octet-stream',
            visibility,
            model_config_id: modelConfigId,
          },
        },
      );

      await postPresigned(initialized.uploadUrl, file, initialized.fields);
      return request<DataSource>(
        `/workspaces/${workspaceId}/entities/${entityId}/sources/upload/complete`,
        {
          token,
          method: 'POST',
          body: {
            upload_id: initialized.uploadId,
            display_name: file.name,
            visibility,
            model_config_id: modelConfigId,
          },
        },
      );
    })(),
  initUploadSource: (
    token: string,
    workspaceId: string,
    entityId: string,
    body: {
      file_name: string;
      file_size_bytes: number;
      content_type?: string;
      visibility?: 'self' | 'self_and_descendants';
      model_config_id?: string;
    },
  ) =>
    request<UploadInitResponse>(
      `/workspaces/${workspaceId}/entities/${entityId}/sources/upload/init`,
      {
        token,
        method: 'POST',
        body,
      },
    ),
  completeUploadSource: (
    token: string,
    workspaceId: string,
    entityId: string,
    body: {
      upload_id: string;
      display_name?: string;
      visibility?: 'self' | 'self_and_descendants';
      model_config_id?: string;
      checksum?: string;
    },
  ) =>
    request<DataSource>(
      `/workspaces/${workspaceId}/entities/${entityId}/sources/upload/complete`,
      {
        token,
        method: 'POST',
        body,
      },
    ),
  postPresignedUpload: (uploadUrl: string, file: File, fields?: Record<string, string>) =>
    postPresigned(uploadUrl, file, fields),
  retrySource: (
    token: string,
    workspaceId: string,
    entityId: string,
    sourceId: string,
  ) =>
    request<{ success: boolean; queued: boolean; dataSourceId: string }>(
      `/workspaces/${workspaceId}/entities/${entityId}/sources/${sourceId}/retry`,
      {
        token,
        method: 'POST',
      },
    ),
  deleteSource: (
    token: string,
    workspaceId: string,
    entityId: string,
    sourceId: string,
  ) =>
    request<{ success: boolean }>(
      `/workspaces/${workspaceId}/entities/${entityId}/sources/${sourceId}`,
      {
        token,
        method: 'DELETE',
      },
    ),
  getSourceError: (
    token: string,
    workspaceId: string,
    entityId: string,
    sourceId: string,
  ) =>
    request<SourceErrorDetails>(
      `/workspaces/${workspaceId}/entities/${entityId}/sources/${sourceId}/error`,
      { token },
    ),

  listProviders: (token: string, workspaceId: string) =>
    request<ProviderConnection[]>(`/workspaces/${workspaceId}/providers`, { token }),
  createProvider: (
    token: string,
    workspaceId: string,
    body: {
      provider: string;
      display_name: string;
      api_key: string;
      entity_id?: string;
      provider_config?: Record<string, unknown>;
    },
  ) =>
    request<ProviderConnection>(`/workspaces/${workspaceId}/providers`, {
      token,
      method: 'POST',
      body,
    }),
  testProvider: (token: string, workspaceId: string, id: string) =>
    request<{ success: boolean }>(`/workspaces/${workspaceId}/providers/${id}/test`, {
      token,
      method: 'POST',
    }),
  setProviderActive: (token: string, workspaceId: string, id: string, isActive: boolean) =>
    request<ProviderConnection>(`/workspaces/${workspaceId}/providers/${id}`, {
      token,
      method: 'PATCH',
      body: { is_active: isActive },
    }),
  deleteProvider: (token: string, workspaceId: string, id: string) =>
    request<{ success: boolean }>(`/workspaces/${workspaceId}/providers/${id}`, {
      token,
      method: 'DELETE',
    }),

  listModelDefinitions: (token: string, type?: string) =>
    request<ModelDefinition[]>(`/model-definitions${type ? `?type=${type}` : ''}`, {
      token,
    }),
  listModelConfigs: (token: string, workspaceId: string) =>
    request<ModelConfig[]>(`/workspaces/${workspaceId}/model-configs`, { token }),
  createModelConfig: (
    token: string,
    workspaceId: string,
    body: {
      name: string;
      llm_model_id: string;
      embedding_model_id: string;
      // temporarily disabled: reranker_model_id?: string;
      provider_connection_id?: string;
      llm_provider_connection_id?: string;
      embedding_provider_connection_id?: string;
      entity_id?: string;
      system_prompt?: string;
      embedding_doc_prefix?: string;
      embedding_query_prefix?: string;
      temperature?: number;
      top_k?: number;
      chunk_strategy?: 'fixed' | 'sliding' | 'semantic';
      chunk_size?: number;
      chunk_overlap?: number;
      retrieval_profile_version?: number;
      is_default?: boolean;
    },
  ) =>
    request<ModelConfig>(`/workspaces/${workspaceId}/model-configs`, {
      token,
      method: 'POST',
      body,
    }),
  updateModelConfig: (
    token: string,
    workspaceId: string,
    id: string,
    body: {
      name?: string;
      llm_model_id?: string;
      embedding_model_id?: string;
      // temporarily disabled: reranker_model_id?: string;
      provider_connection_id?: string;
      llm_provider_connection_id?: string;
      embedding_provider_connection_id?: string;
      entity_id?: string;
      system_prompt?: string;
      embedding_doc_prefix?: string;
      embedding_query_prefix?: string;
      temperature?: number;
      top_k?: number;
      chunk_strategy?: 'fixed' | 'sliding' | 'semantic';
      chunk_size?: number;
      chunk_overlap?: number;
      retrieval_profile_version?: number;
      is_default?: boolean;
    },
  ) =>
    request<ModelConfig>(`/workspaces/${workspaceId}/model-configs/${id}`, {
      token,
      method: 'PATCH',
      body,
    }),
  deleteModelConfig: (token: string, workspaceId: string, id: string) =>
    request<{ success: boolean }>(`/workspaces/${workspaceId}/model-configs/${id}`, {
      token,
      method: 'DELETE',
    }),

  query: (
    token: string,
    body: {
      workspaceId: string;
      entityId: string;
      modelConfigId: string;
      query: string;
      topK?: number;
      includeParentScopes?: boolean;
    },
    debug = false,
  ) =>
    request<QueryResponse>(`/query${debug ? '/debug' : ''}`, {
      token,
      method: 'POST',
      body,
    }),

  usageSummary: (token: string, workspaceId: string) =>
    request<UsageSummary>(`/workspaces/${workspaceId}/usage`, { token }),
  dashboardAnalytics: (token: string, workspaceId: string, days = 7) =>
    request<DashboardAnalytics>(
      `/workspaces/${workspaceId}/usage/dashboard?days=${encodeURIComponent(days)}`,
      { token },
    ),
  queryLogs: (token: string, workspaceId: string, limit = 50) =>
    request<QueryLog[]>(`/workspaces/${workspaceId}/usage/query-logs?limit=${limit}`, {
      token,
    }),
  auditLogs: (token: string, workspaceId: string) =>
    request<AuditLog[]>(`/workspaces/${workspaceId}/audit`, { token }),

  listNotifications: (token: string, workspaceId?: string) =>
    request<AppNotification[]>(
      workspaceId
        ? `/notifications?workspaceId=${encodeURIComponent(workspaceId)}`
        : '/notifications',
      { token },
    ),
  markNotificationRead: (token: string, notificationId: string) =>
    request<{ success: boolean }>(`/notifications/${notificationId}/read`, {
      token,
      method: 'PATCH',
    }),
  markAllNotificationsRead: (token: string, workspaceId?: string) =>
    request<{ success: boolean }>('/notifications/read-all', {
      token,
      method: 'POST',
      body: { workspaceId },
    }),
  getNotificationPreferences: (token: string) =>
    request<NotificationPreferences>('/notifications/preferences', { token }),
  updateNotificationPreferences: (
    token: string,
    body: Partial<NotificationPreferences>,
  ) =>
    request<NotificationPreferences>('/notifications/preferences', {
      token,
      method: 'PATCH',
      body,
    }),

  listApiKeys: (token: string, workspaceId: string) =>
    request<WorkspaceApiKey[]>(`/workspaces/${workspaceId}/api-keys`, { token }),
  createApiKey: (
    token: string,
    workspaceId: string,
    body: {
      name: string;
      capabilities?: Array<
        'query:read' | 'data:ingest' | 'audit:read' | 'config:manage'
      >;
      allowed_entity_ids: string[];
      allowed_model_config_ids: string[];
      rpm_limit?: number;
      daily_token_limit?: number;
      expires_at?: string;
    },
  ) =>
    request<WorkspaceApiKey & { secret: string }>(`/workspaces/${workspaceId}/api-keys`, {
      token,
      method: 'POST',
      body,
    }),
  updateApiKey: (
    token: string,
    workspaceId: string,
    id: string,
    body: {
      name?: string;
      capabilities?: Array<
        'query:read' | 'data:ingest' | 'audit:read' | 'config:manage'
      >;
      allowed_entity_ids?: string[];
      allowed_model_config_ids?: string[];
      rpm_limit?: number;
      daily_token_limit?: number;
      expires_at?: string;
      is_active?: boolean;
    },
  ) =>
    request<WorkspaceApiKey>(`/workspaces/${workspaceId}/api-keys/${id}`, {
      token,
      method: 'PATCH',
      body,
    }),
  revokeApiKey: (token: string, workspaceId: string, id: string) =>
    request<{ success: boolean }>(`/workspaces/${workspaceId}/api-keys/${id}/revoke`, {
      token,
      method: 'POST',
    }),
  rotateApiKey: (token: string, workspaceId: string, id: string) =>
    request<WorkspaceApiKey & { secret: string }>(`/workspaces/${workspaceId}/api-keys/${id}/rotate`, {
      token,
      method: 'POST',
    }),
};
