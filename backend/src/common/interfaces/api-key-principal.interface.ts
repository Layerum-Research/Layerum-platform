export type ApiKeyCapability =
  | 'query:read'
  | 'data:ingest'
  | 'audit:read'
  | 'config:manage';

export interface ApiKeyPrincipal {
  id: string;
  workspaceId: string;
  name: string;
  capabilities: ApiKeyCapability[];
  allowedEntityIds: string[];
  allowedModelConfigIds: string[];
  rpmLimit: number | null;
  dailyTokenLimit: number | null;
}
