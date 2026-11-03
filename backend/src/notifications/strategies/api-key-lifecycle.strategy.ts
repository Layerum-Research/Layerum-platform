import { Injectable } from '@nestjs/common';
import { NotificationDirectory } from '../domain/ports';
import type { NotificationStrategy } from '../domain/notification.strategy';
import type {
  ApiKeyLifecycleEvent,
  NotificationDraft,
  NotificationSeverity,
} from '../domain/notification.types';

const SEVERITY: Record<ApiKeyLifecycleEvent['type'], NotificationSeverity> = {
  api_key_created: 'info',
  api_key_revoked: 'warning',
  api_key_rotated: 'warning',
};

@Injectable()
export class ApiKeyLifecycleStrategy implements NotificationStrategy<ApiKeyLifecycleEvent> {
  readonly types = [
    'api_key_created',
    'api_key_revoked',
    'api_key_rotated',
  ] as const;

  constructor(private readonly directory: NotificationDirectory) {}

  async buildDrafts(event: ApiKeyLifecycleEvent): Promise<NotificationDraft[]> {
    const members = await this.directory.listRankedMembers(event.workspaceId);
    const actorRank =
      members.find((member) => member.userId === event.actorUserId)?.rank ?? 0;
    const recipients = members.filter((member) => member.rank > actorRank);
    if (recipients.length === 0) return [];

    const [workspaceName, actorName] = await Promise.all([
      this.directory.getWorkspaceName(event.workspaceId),
      this.directory.getUserDisplayName(event.actorUserId),
    ]);

    return recipients.map((recipient) => ({
      userId: recipient.userId,
      workspaceId: event.workspaceId,
      type: event.type,
      severity: SEVERITY[event.type],
      payload: {
        workspaceName,
        actorName,
        keyId: event.keyId,
        keyName: event.keyName,
      },
      dedupeKey: null,
    }));
  }
}
