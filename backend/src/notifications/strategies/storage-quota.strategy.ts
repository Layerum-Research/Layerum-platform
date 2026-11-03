import { Injectable } from '@nestjs/common';
import { NotificationDirectory } from '../domain/ports';
import type { NotificationStrategy } from '../domain/notification.strategy';
import type {
  NotificationDraft,
  NotificationSeverity,
  StorageQuotaEvent,
} from '../domain/notification.types';

const SEVERITY: Record<StorageQuotaEvent['type'], NotificationSeverity> = {
  storage_quota_warning: 'warning',
  storage_quota_reached: 'critical',
};

@Injectable()
export class StorageQuotaStrategy implements NotificationStrategy<StorageQuotaEvent> {
  readonly types = ['storage_quota_warning', 'storage_quota_reached'] as const;

  constructor(private readonly directory: NotificationDirectory) {}

  async buildDrafts(event: StorageQuotaEvent): Promise<NotificationDraft[]> {
    const ownerUserId =
      event.ownerUserId ??
      (await this.directory.getWorkspaceOwnerId(event.workspaceId));
    if (!ownerUserId) return [];

    return [
      {
        userId: ownerUserId,
        workspaceId: null,
        type: event.type,
        severity: SEVERITY[event.type],
        payload: {
          usedBytes: event.usedBytes,
          capacityBytes: event.capacityBytes,
        },
        dedupeKey: event.type,
      },
    ];
  }
}
