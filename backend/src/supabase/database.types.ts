export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type AnyRow = Record<string, any>;
type AnyInsert = Record<string, any>;
type AnyUpdate = Record<string, any>;
type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};
type Table<
  Row = AnyRow,
  Insert = AnyInsert,
  Update = AnyUpdate,
  Relationships extends readonly Relationship[] = [],
> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationships;
};
type FunctionDef<Args = Record<string, any>, Returns = any> = {
  Args: Args;
  Returns: Returns;
};

export type Database = {
  public: {
    Tables: {
      users: Table;
      workspaces: Table;
      workspace_users: Table;
      workspace_roles: Table;
      workspace_role_permissions: Table;
      workspace_invites: Table;
      workspace_api_keys: Table;
      workspace_encryption_keys: Table;
      entity_types: Table;
      entities: Table<
        AnyRow,
        AnyInsert,
        AnyUpdate,
        [
          {
            foreignKeyName: 'entities_entity_type_id_fkey';
            columns: ['entity_type_id'];
            isOneToOne: false;
            referencedRelation: 'entity_types';
            referencedColumns: ['id'];
          },
        ]
      >;
      entity_permissions: Table;
      provider_connections: Table;
      model_definitions: Table;
      model_configs: Table<
        AnyRow,
        AnyInsert,
        AnyUpdate,
        [
          {
            foreignKeyName: 'model_configs_llm_model_id_fkey';
            columns: ['llm_model_id'];
            isOneToOne: false;
            referencedRelation: 'model_definitions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'model_configs_embedding_model_id_fkey';
            columns: ['embedding_model_id'];
            isOneToOne: false;
            referencedRelation: 'model_definitions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'model_configs_provider_connection_id_fkey';
            columns: ['provider_connection_id'];
            isOneToOne: false;
            referencedRelation: 'provider_connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'model_configs_entity_id_fkey';
            columns: ['entity_id'];
            isOneToOne: false;
            referencedRelation: 'entities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'model_configs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ]
      >;
      data_sources: Table;
      documents: Table;
      document_chunks: Table;
      vector_records: Table;
      chat_sessions: Table;
      chat_messages: Table;
      query_logs: Table;
      ingestion_jobs: Table;
      audit_logs: Table;
      billing_usage: Table;
      subscription_plans: Table;
      user_subscriptions: Table;
      upload_sessions: Table;
      user_sessions: Table;
      mfa_recovery_tokens: Table;
      notifications: Table;
      notification_preferences: Table;
      oauth_authorization_codes: Table;
      oauth_access_tokens: Table;
      model_catalog_sync_state: Table;
    };
    Views: Record<string, never>;
    Functions: {
      workspace_user_usage_stats: FunctionDef<
        { p_workspace_ids: string[] },
        Array<{
          workspace_id: string;
          member_count: number;
          entity_count: number;
          document_count: number;
          chunk_count: number;
          entity_bytes: number;
          document_bytes: number;
          chunk_bytes: number;
          usage_bytes: number;
        }>
      >;
      reserve_upload_session: FunctionDef<
        {
          p_workspace_id: string;
          p_entity_id: string;
          p_created_by: string;
          p_object_key: string;
          p_declared_size_bytes: number;
          p_expires_at: string;
        },
        Array<{
          upload_id: string;
          owner_user_id: string;
          capacity_bytes: number;
          used_bytes: number;
          projected_used_bytes: number;
          remaining_bytes: number;
        }>
      >;
      finalize_upload_session: FunctionDef<
        {
          p_upload_id: string;
          p_workspace_id: string;
          p_entity_id: string;
          p_data_source_id: string;
          p_actual_size_bytes: number;
        },
        Array<{
          object_key: string;
          declared_size_bytes: number;
        }>
      >;
      claim_upload_sessions_for_cleanup: FunctionDef<
        { p_limit?: number },
        Array<{
          upload_id: string;
          object_key: string;
        }>
      >;
      mark_upload_session_cleanup_result: FunctionDef<
        {
          p_upload_id: string;
          p_success: boolean;
          p_error?: string | null;
        },
        void
      >;
      users_mfa_enrolled: FunctionDef<
        { p_user_ids: string[] },
        Array<{ user_id: string }>
      >;
      workspace_query_summary: FunctionDef<
        { p_workspace_id: string },
        Array<{
          total_queries: number;
          total_tokens: number;
        }>
      >;
      workspace_query_buckets: FunctionDef<
        { p_workspace_id: string; p_since: string; p_granularity: string },
        Array<{
          bucket_start: string;
          queries: number;
          tokens: number;
          latency_sum: number;
          latency_count: number;
          failures: number;
          throttled: number;
        }>
      >;
      workspace_peak_load: FunctionDef<
        { p_workspace_id: string; p_since: string },
        Array<{
          peak_per_min: number;
        }>
      >;
      authorize_user_session: FunctionDef<
        {
          p_user_id: string;
          p_session_id: string | null;
          p_ip_address: string | null;
          p_user_agent: string | null;
          p_os_name: string;
          p_browser_name: string;
          p_device_type: string;
          p_device_label: string;
          p_touch_after?: string;
        },
        Array<{
          user_exists: boolean;
          session_revoked: boolean;
        }>
      >;
      sync_model_definitions: FunctionDef<
        {
          p_providers: string[];
          p_rows: Array<{
            provider: string;
            provider_key: string;
            display_name: string;
            model_type: 'llm' | 'embedding';
            family: string | null;
            context_window: number | null;
            max_output: number | null;
            capabilities: string[];
            pricing: {
              input: number | null;
              output: number | null;
              cache_read: number | null;
            } | null;
            release_date: string | null;
            catalog_status: 'beta' | 'deprecated' | null;
            catalog_hash: string;
          }>;
        },
        Array<{ inserted: number; updated: number; deactivated: number }>
      >;
      insert_notifications: FunctionDef<
        {
          p_rows: Array<{
            user_id: string;
            workspace_id: string | null;
            type: string;
            severity: string;
            payload: Record<string, string | number | null>;
            dedupe_key: string | null;
          }>;
        },
        number
      >;
      abort_upload_session: FunctionDef<
        {
          p_upload_id: string;
          p_error?: string | null;
        },
        void
      >;
    };
    Enums: {
      workspace_role: 'owner' | 'admin' | 'editor' | 'viewer' | 'api_only';
      visibility_mode: 'self' | 'self_and_descendants';
      data_source_type: 'file' | 'url' | 'text' | 'api';
      ingestion_status: 'pending' | 'processing' | 'completed' | 'failed';
      embedding_status: 'pending' | 'processing' | 'completed' | 'failed';
      model_type: 'llm' | 'embedding' | 'reranker' | 'speech';
      provider_name:
        | 'openai'
        | 'anthropic'
        | 'cohere'
        | 'google'
        | 'mistral'
        | 'groq'
        | 'together'
        | 'azure_openai'
        | 'qwen'
        | 'kimi'
        | 'deepseek'
        | 'custom';
      audit_action:
        | 'create'
        | 'update'
        | 'delete'
        | 'read'
        | 'login'
        | 'logout'
        | 'key_rotation'
        | 'query'
        | 'upload';
    };
    CompositeTypes: Record<string, never>;
  };
};
