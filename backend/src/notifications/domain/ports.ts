import type { WorkspaceRank } from './workspace-rank';
import type {
  NotificationDraft,
  NotificationRecord,
} from './notification.types';
import type { NotificationPreferences } from './notification-preferences';

export type RankedMember = {
  userId: string;
  rank: WorkspaceRank;
};

export abstract class NotificationRepository {
  abstract insertMany(drafts: NotificationDraft[]): Promise<void>;
  abstract listUnread(
    userId: string,
    workspaceId: string | null,
    limit: number,
  ): Promise<NotificationRecord[]>;
  abstract markRead(userId: string, notificationId: string): Promise<void>;
  abstract markAllRead(
    userId: string,
    workspaceId: string | null,
  ): Promise<void>;
  abstract purgeReadBefore(cutoff: Date): Promise<void>;
}

export abstract class NotificationDirectory {
  abstract listRankedMembers(workspaceId: string): Promise<RankedMember[]>;
  abstract getWorkspaceName(workspaceId: string): Promise<string | null>;
  abstract getWorkspaceOwnerId(workspaceId: string): Promise<string | null>;
  abstract getUserDisplayName(userId: string): Promise<string | null>;
  abstract listOwnerUserIds(): Promise<string[]>;
  abstract listUserEmails(userIds: string[]): Promise<Map<string, string>>;
}

export abstract class NotificationPreferencesRepository {
  abstract get(userId: string): Promise<NotificationPreferences>;
  abstract getMany(
    userIds: string[],
  ): Promise<Map<string, NotificationPreferences>>;
  abstract update(
    userId: string,
    changes: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences>;
}
