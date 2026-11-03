import { Injectable } from '@nestjs/common';
import { NotificationDirectory } from '../domain/ports';
import type { NotificationStrategy } from '../domain/notification.strategy';
import type {
  IngestionFailedEvent,
  NotificationDraft,
} from '../domain/notification.types';

@Injectable()
export class IngestionFailedStrategy implements NotificationStrategy<IngestionFailedEvent> {
  readonly types = ['ingestion_failed'] as const;

  constructor(private readonly directory: NotificationDirectory) {}

  async buildDrafts(event: IngestionFailedEvent): Promise<NotificationDraft[]> {
    const workspaceName = await this.directory.getWorkspaceName(
      event.workspaceId,
    );

    return [
      {
        userId: event.uploaderUserId,
        workspaceId: event.workspaceId,
        type: event.type,
        severity: 'warning',
        payload: {
          workspaceName,
          dataSourceId: event.dataSourceId,
          entityId: event.entityId,
          displayName: event.displayName,
        },
        dedupeKey: `ingestion_failed:${event.dataSourceId}`,
      },
    ];
  }
}
