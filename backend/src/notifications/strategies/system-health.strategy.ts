import { Injectable } from '@nestjs/common';
import { NotificationDirectory } from '../domain/ports';
import type { NotificationStrategy } from '../domain/notification.strategy';
import type {
  NotificationDraft,
  NotificationPayload,
  NotificationSeverity,
  SystemHealthDownEvent,
  SystemHealthRecoveredEvent,
} from '../domain/notification.types';

type SystemHealthEvent = SystemHealthDownEvent | SystemHealthRecoveredEvent;

const SEVERITY: Record<SystemHealthEvent['type'], NotificationSeverity> = {
  system_health_down: 'critical',
  system_health_recovered: 'info',
};

const DEDUPE_KEY: Record<
  SystemHealthEvent['type'],
  (component: string) => string | null
> = {
  system_health_down: (component) => `system_health_down:${component}`,
  system_health_recovered: () => null,
};

@Injectable()
export class SystemHealthStrategy implements NotificationStrategy<SystemHealthEvent> {
  readonly types = ['system_health_down', 'system_health_recovered'] as const;

  constructor(private readonly directory: NotificationDirectory) {}

  async buildDrafts(event: SystemHealthEvent): Promise<NotificationDraft[]> {
    const ownerIds = await this.directory.listOwnerUserIds();
    const { type, ...details } = event;
    const payload: NotificationPayload = details;

    return ownerIds.map((userId) => ({
      userId,
      workspaceId: null,
      type,
      severity: SEVERITY[type],
      payload,
      dedupeKey: DEDUPE_KEY[type](event.component),
    }));
  }
}
