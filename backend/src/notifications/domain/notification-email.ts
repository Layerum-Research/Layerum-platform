import type { NotificationDraft } from './notification.types';

export type NotificationEmail = {
  subject: string;
  textBody: string;
};

const COMPONENT_LABELS: Record<string, string> = {
  database: 'Database',
  qdrant: 'Vector store',
  redis: 'Redis',
};

const FOOTER =
  'You can turn these emails off in your Layerum account settings under Notification Preferences.';

function componentLabel(draft: NotificationDraft) {
  const component = String(draft.payload.component ?? 'A service');
  return COMPONENT_LABELS[component] ?? component;
}

function utc(value: string | number | null | undefined) {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return 'an unknown time';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function withFooter(lines: string[]) {
  return [...lines, '', FOOTER].join('\n');
}

export function buildNotificationEmail(
  draft: NotificationDraft,
): NotificationEmail | null {
  const { payload } = draft;

  if (draft.type === 'system_health_down') {
    const label = componentLabel(draft);
    return {
      subject: `Layerum: ${label} is unavailable`,
      textBody: withFooter([
        `${label} has been unavailable since ${utc(payload.since)}.`,
        'We are working on restoring it.',
      ]),
    };
  }

  if (draft.type === 'system_health_recovered') {
    const label = componentLabel(draft);
    return {
      subject: `Layerum: ${label} recovered`,
      textBody: withFooter([
        `${label} is available again.`,
        `It was unavailable from ${utc(payload.downSince)} to ${utc(payload.recoveredAt)}.`,
      ]),
    };
  }

  if (draft.type === 'api_key_token_usage_warning') {
    const keyName = String(payload.keyName ?? 'API key');
    const workspaceName = String(payload.workspaceName ?? 'your workspace');
    return {
      subject: `Layerum: API key "${keyName}" used 80% of its daily token limit`,
      textBody: withFooter([
        `API key "${keyName}" in ${workspaceName} has used ${Number(payload.usedTokens).toLocaleString('en-US')} of ${Number(payload.limitTokens).toLocaleString('en-US')} tokens today.`,
        'Requests with this key are rejected once the limit is reached. The limit resets at 00:00 UTC.',
      ]),
    };
  }

  return null;
}
