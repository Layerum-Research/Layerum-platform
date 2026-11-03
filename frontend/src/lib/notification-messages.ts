import type {
  AppNotification,
  NotificationPayload,
  NotificationType,
} from './types';

export type NotificationMessage = {
  title: string;
  detail: string;
};

type Formatter = (payload: NotificationPayload) => NotificationMessage;

const COMPONENT_LABELS: Record<string, string> = {
  database: 'Database',
  qdrant: 'Vector store',
  redis: 'Redis',
};

function text(payload: NotificationPayload, key: string, fallback: string) {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function bytes(value: string | number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function tokens(value: string | number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US')
    : '?';
}

function componentLabel(payload: NotificationPayload) {
  const component = text(payload, 'component', 'service');
  return COMPONENT_LABELS[component] ?? component;
}

function duration(fromIso: string, toIso: string) {
  const minutes = Math.max(
    1,
    Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000),
  );
  if (!Number.isFinite(minutes)) return 'a while';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function apiKeyMessage(title: string, verb: string): Formatter {
  return (payload) => ({
    title,
    detail: `${text(payload, 'actorName', 'A member')} ${verb} “${text(payload, 'keyName', 'API key')}”`,
  });
}

function storageUsage(payload: NotificationPayload, fallback: string) {
  const used = bytes(payload.usedBytes);
  const capacity = bytes(payload.capacityBytes);
  return used && capacity ? `${used} of ${capacity} used` : fallback;
}

const FORMATTERS: Record<NotificationType, Formatter> = {
  api_key_created: apiKeyMessage('API key created', 'created'),
  api_key_revoked: apiKeyMessage('API key revoked', 'revoked'),
  api_key_rotated: apiKeyMessage('API key rotated', 'rotated'),
  api_key_token_usage_warning: (payload) => ({
    title: 'API key near its daily token limit',
    detail: `“${text(payload, 'keyName', 'API key')}” used ${tokens(payload.usedTokens)} of ${tokens(payload.limitTokens)} tokens today`,
  }),
  workspace_invite_accepted: (payload) => ({
    title: 'Invite accepted',
    detail: `${text(payload, 'memberName', 'A new member')} joined ${text(payload, 'workspaceName', 'the workspace')}`,
  }),
  ingestion_failed: (payload) => ({
    title: 'Document processing failed',
    detail: text(payload, 'displayName', 'Untitled source'),
  }),
  storage_quota_warning: (payload) => ({
    title: 'Storage almost full',
    detail: storageUsage(payload, 'Over 90% of your storage is used'),
  }),
  storage_quota_reached: (payload) => ({
    title: 'Storage limit reached',
    detail: storageUsage(payload, 'Uploads are blocked until space is freed'),
  }),
  system_health_down: (payload) => ({
    title: `${componentLabel(payload)} is unavailable`,
    detail: 'We are working on restoring it',
  }),
  system_health_recovered: (payload) => ({
    title: `${componentLabel(payload)} recovered`,
    detail: `Unavailable for ${duration(
      text(payload, 'downSince', ''),
      text(payload, 'recoveredAt', ''),
    )}`,
  }),
};

export function describeNotification(
  notification: AppNotification,
): NotificationMessage {
  return FORMATTERS[notification.type](notification.payload);
}
