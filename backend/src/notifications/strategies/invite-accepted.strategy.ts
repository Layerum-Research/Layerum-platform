import { Injectable } from '@nestjs/common';
import { NotificationDirectory } from '../domain/ports';
import type { NotificationStrategy } from '../domain/notification.strategy';
import type {
  InviteAcceptedEvent,
  NotificationDraft,
} from '../domain/notification.types';

@Injectable()
export class InviteAcceptedStrategy implements NotificationStrategy<InviteAcceptedEvent> {
  readonly types = ['workspace_invite_accepted'] as const;

  constructor(private readonly directory: NotificationDirectory) {}

  async buildDrafts(event: InviteAcceptedEvent): Promise<NotificationDraft[]> {
    if (event.inviterUserId === event.memberUserId) return [];

    const [workspaceName, memberName] = await Promise.all([
      this.directory.getWorkspaceName(event.workspaceId),
      this.directory.getUserDisplayName(event.memberUserId),
    ]);

    return [
      {
        userId: event.inviterUserId,
        workspaceId: event.workspaceId,
        type: event.type,
        severity: 'info',
        payload: { workspaceName, memberName },
        dedupeKey: null,
      },
    ];
  }
}
