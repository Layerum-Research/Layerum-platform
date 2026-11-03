import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import {
  NotificationDirectory,
  NotificationPreferencesRepository,
  NotificationRepository,
} from './domain/ports';
import { NotificationStrategyRegistry } from './notification-strategy.registry';
import type {
  NotificationDraft,
  NotificationEvent,
} from './domain/notification.types';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  categoryOf,
  channelsFor,
  type NotificationPreferences,
} from './domain/notification-preferences';
import { buildNotificationEmail } from './domain/notification-email';

const UNREAD_LIST_LIMIT = 50;
const READ_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly repository: NotificationRepository,
    private readonly registry: NotificationStrategyRegistry,
    private readonly preferences: NotificationPreferencesRepository,
    private readonly directory: NotificationDirectory,
    private readonly email: EmailService,
  ) {}

  async notify(event: NotificationEvent) {
    try {
      const drafts = await this.registry.resolve(event).buildDrafts(event);
      if (drafts.length === 0) return;

      const category = categoryOf(event.type);
      if (!category) {
        await this.repository.insertMany(drafts);
        return;
      }

      const preferences = await this.preferences.getMany(
        drafts.map((draft) => draft.userId),
      );
      const channelsOf = (draft: NotificationDraft) =>
        channelsFor(
          category,
          preferences.get(draft.userId) ?? DEFAULT_NOTIFICATION_PREFERENCES,
        );

      const inAppDrafts = drafts.filter((draft) => channelsOf(draft).inApp);
      if (inAppDrafts.length > 0) await this.repository.insertMany(inAppDrafts);

      await this.sendEmails(drafts.filter((draft) => channelsOf(draft).email));
    } catch (error) {
      this.logger.warn(
        `Failed to deliver ${event.type} notification: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  listUnread(userId: string, workspaceId: string | null) {
    return this.repository.listUnread(userId, workspaceId, UNREAD_LIST_LIMIT);
  }

  async markRead(userId: string, notificationId: string) {
    await this.repository.markRead(userId, notificationId);
    return { success: true };
  }

  async markAllRead(userId: string, workspaceId: string | null) {
    await this.repository.markAllRead(userId, workspaceId);
    return { success: true };
  }

  getPreferences(userId: string) {
    return this.preferences.get(userId);
  }

  updatePreferences(userId: string, changes: Partial<NotificationPreferences>) {
    return this.preferences.update(userId, changes);
  }

  purgeReadNotifications(retentionDays = READ_RETENTION_DAYS) {
    return this.repository.purgeReadBefore(
      new Date(Date.now() - retentionDays * DAY_MS),
    );
  }

  private async sendEmails(drafts: NotificationDraft[]) {
    if (drafts.length === 0) return;
    const emails = await this.directory.listUserEmails(
      drafts.map((draft) => draft.userId),
    );

    // Sent one at a time to stay under the email provider's rate limit.
    for (const draft of drafts) {
      const to = emails.get(draft.userId);
      const message = buildNotificationEmail(draft);
      if (!to || !message) continue;
      try {
        await this.email.sendTextEmail({
          to,
          ...message,
          from: process.env.RESEND_FROM_NOTIFICATION_EMAIL,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to email ${draft.type} notification to user ${draft.userId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
