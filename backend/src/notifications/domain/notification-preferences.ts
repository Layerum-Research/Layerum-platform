import type { NotificationType } from './notification.types';

export type NotificationCategory = 'system_health' | 'api_usage';

export type NotificationPreferences = {
  system_health_in_app: boolean;
  system_health_email: boolean;
  api_usage_in_app: boolean;
  api_usage_email: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  system_health_in_app: true,
  system_health_email: false,
  api_usage_in_app: true,
  api_usage_email: false,
};

const CATEGORY_BY_TYPE: Partial<
  Record<NotificationType, NotificationCategory>
> = {
  system_health_down: 'system_health',
  system_health_recovered: 'system_health',
  api_key_token_usage_warning: 'api_usage',
};

export function categoryOf(type: NotificationType) {
  return CATEGORY_BY_TYPE[type] ?? null;
}

export function channelsFor(
  category: NotificationCategory,
  preferences: NotificationPreferences,
) {
  return {
    inApp: preferences[`${category}_in_app`],
    email: preferences[`${category}_email`],
  };
}
