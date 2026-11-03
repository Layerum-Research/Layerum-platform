import { NotificationsService } from './notifications.service';
import type {
  NotificationDirectory,
  NotificationPreferencesRepository,
  NotificationRepository,
} from './domain/ports';
import type { NotificationStrategyRegistry } from './notification-strategy.registry';
import type { EmailService } from '../email/email.service';
import type { NotificationDraft } from './domain/notification.types';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from './domain/notification-preferences';

const EVENT = {
  type: 'system_health_down' as const,
  component: 'redis' as const,
  since: '2026-09-23T07:15:00.000Z',
};

function draftFor(
  userId: string,
  type: NotificationDraft['type'] = 'system_health_down',
): NotificationDraft {
  return {
    userId,
    workspaceId: null,
    type,
    severity: 'critical',
    payload: { component: 'redis', since: EVENT.since },
    dedupeKey: null,
  };
}

function setup(options: {
  drafts?: NotificationDraft[];
  buildDrafts?: jest.Mock;
  preferences?: Record<string, Partial<NotificationPreferences>>;
  sendTextEmail?: jest.Mock;
}) {
  const insertMany = jest.fn();
  const getMany = jest
    .fn()
    .mockResolvedValue(
      new Map(
        Object.entries(options.preferences ?? {}).map(([userId, changes]) => [
          userId,
          { ...DEFAULT_NOTIFICATION_PREFERENCES, ...changes },
        ]),
      ),
    );
  const sendTextEmail =
    options.sendTextEmail ?? jest.fn().mockResolvedValue({ success: true });
  const registry = {
    resolve: () => ({
      types: ['system_health_down'],
      buildDrafts:
        options.buildDrafts ??
        jest.fn().mockResolvedValue(options.drafts ?? []),
    }),
  } as unknown as NotificationStrategyRegistry;
  const directory = {
    listUserEmails: jest.fn(async (userIds: string[]) =>
      Promise.resolve(
        new Map(userIds.map((userId) => [userId, `${userId}@example.com`])),
      ),
    ),
  } as unknown as NotificationDirectory;

  const service = new NotificationsService(
    { insertMany } as unknown as NotificationRepository,
    registry,
    { getMany } as unknown as NotificationPreferencesRepository,
    directory,
    { sendTextEmail } as unknown as EmailService,
  );
  return { service, insertMany, getMany, sendTextEmail };
}

describe('NotificationsService', () => {
  it('never throws when delivery fails', async () => {
    const { service } = setup({
      buildDrafts: jest.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(service.notify(EVENT)).resolves.toBeUndefined();
  });

  it('skips the insert when there are no recipients', async () => {
    const { service, insertMany } = setup({ drafts: [] });

    await service.notify(EVENT);

    expect(insertMany).not.toHaveBeenCalled();
  });

  it('delivers in-app only when the user has no saved preferences', async () => {
    const drafts = [draftFor('user-1')];
    const { service, insertMany, sendTextEmail } = setup({ drafts });

    await service.notify(EVENT);

    expect(insertMany).toHaveBeenCalledWith(drafts);
    expect(sendTextEmail).not.toHaveBeenCalled();
  });

  it('routes each recipient to the channels they enabled', async () => {
    const { service, insertMany, sendTextEmail } = setup({
      drafts: [
        draftFor('in-app-only'),
        draftFor('email-only'),
        draftFor('off'),
      ],
      preferences: {
        'email-only': {
          system_health_in_app: false,
          system_health_email: true,
        },
        off: { system_health_in_app: false },
      },
    });

    await service.notify(EVENT);

    expect(insertMany).toHaveBeenCalledWith([draftFor('in-app-only')]);
    expect(sendTextEmail).toHaveBeenCalledTimes(1);
    expect(sendTextEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'email-only@example.com',
        subject: 'Layerum: Redis is unavailable',
      }),
    );
  });

  it('keeps emailing the other recipients when one email fails', async () => {
    const sendTextEmail = jest
      .fn()
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValue({ success: true });
    const { service } = setup({
      drafts: [draftFor('user-1'), draftFor('user-2')],
      preferences: {
        'user-1': { system_health_email: true },
        'user-2': { system_health_email: true },
      },
      sendTextEmail,
    });

    await service.notify(EVENT);

    expect(sendTextEmail).toHaveBeenCalledTimes(2);
  });

  it('ignores preferences for notification types without a setting', async () => {
    const drafts = [draftFor('user-1', 'ingestion_failed')];
    const { service, insertMany, getMany, sendTextEmail } = setup({ drafts });

    await service.notify({
      type: 'ingestion_failed',
      workspaceId: 'workspace-1',
      uploaderUserId: 'user-1',
      dataSourceId: 'source-1',
      entityId: 'entity-1',
      displayName: 'report.pdf',
    });

    expect(insertMany).toHaveBeenCalledWith(drafts);
    expect(getMany).not.toHaveBeenCalled();
    expect(sendTextEmail).not.toHaveBeenCalled();
  });
});
