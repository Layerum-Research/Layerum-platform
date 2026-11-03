import { Injectable } from '@nestjs/common';
import { NotificationDirectory } from '../domain/ports';
import type { NotificationStrategy } from '../domain/notification.strategy';
import type {
  ApiKeyTokenUsageEvent,
  NotificationDraft,
} from '../domain/notification.types';
import { ADMIN_RANK } from '../domain/workspace-rank';

@Injectable()
export class ApiKeyTokenUsageStrategy implements NotificationStrategy<ApiKeyTokenUsageEvent> {
  readonly types = ['api_key_token_usage_warning'] as const;

  constructor(private readonly directory: NotificationDirectory) {}

  async buildDrafts(
    event: ApiKeyTokenUsageEvent,
  ): Promise<NotificationDraft[]> {
    const members = await this.directory.listRankedMembers(event.workspaceId);
    const recipients = members.filter((member) => member.rank >= ADMIN_RANK);
    if (recipients.length === 0) return [];

    const workspaceName = await this.directory.getWorkspaceName(
      event.workspaceId,
    );

    return recipients.map((recipient) => ({
      userId: recipient.userId,
      workspaceId: event.workspaceId,
      type: event.type,
      severity: 'warning',
      payload: {
        workspaceName,
        keyId: event.keyId,
        keyName: event.keyName,
        usedTokens: event.usedTokens,
        limitTokens: event.limitTokens,
      },
      dedupeKey: null,
    }));
  }
}
