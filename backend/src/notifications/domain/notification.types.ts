import type { HealthComponentName } from '../../system-health/system-health.types';

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

export type ApiKeyLifecycleEvent = {
  type: 'api_key_created' | 'api_key_revoked' | 'api_key_rotated';
  workspaceId: string;
  actorUserId: string;
  keyId: string;
  keyName: string;
};

export type ApiKeyTokenUsageEvent = {
  type: 'api_key_token_usage_warning';
  workspaceId: string;
  keyId: string;
  keyName: string;
  usedTokens: number;
  limitTokens: number;
};

export type InviteAcceptedEvent = {
  type: 'workspace_invite_accepted';
  workspaceId: string;
  inviterUserId: string;
  memberUserId: string;
};

export type IngestionFailedEvent = {
  type: 'ingestion_failed';
  workspaceId: string;
  uploaderUserId: string;
  dataSourceId: string;
  entityId: string;
  displayName: string;
};

export type StorageQuotaEvent = {
  type: 'storage_quota_warning' | 'storage_quota_reached';
  workspaceId: string;
  ownerUserId: string | null;
  usedBytes: number | null;
  capacityBytes: number | null;
};

export type SystemHealthDownEvent = {
  type: 'system_health_down';
  component: HealthComponentName;
  since: string;
};

export type SystemHealthRecoveredEvent = {
  type: 'system_health_recovered';
  component: HealthComponentName;
  downSince: string;
  recoveredAt: string;
};

export type NotificationEvent =
  | ApiKeyLifecycleEvent
  | ApiKeyTokenUsageEvent
  | InviteAcceptedEvent
  | IngestionFailedEvent
  | StorageQuotaEvent
  | SystemHealthDownEvent
  | SystemHealthRecoveredEvent;

export type NotificationPayload = Record<string, string | number | null>;

export type NotificationDraft = {
  userId: string;
  workspaceId: string | null;
  type: NotificationType;
  severity: NotificationSeverity;
  payload: NotificationPayload;
  dedupeKey: string | null;
};

export type NotificationRecord = {
  id: string;
  workspace_id: string | null;
  type: NotificationType;
  severity: NotificationSeverity;
  payload: NotificationPayload;
  created_at: string;
};
