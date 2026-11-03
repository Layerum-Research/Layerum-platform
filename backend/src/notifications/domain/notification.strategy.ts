import type {
  NotificationDraft,
  NotificationEvent,
} from './notification.types';

export interface NotificationStrategy<
  E extends NotificationEvent = NotificationEvent,
> {
  readonly types: readonly E['type'][];
  buildDrafts(event: E): Promise<NotificationDraft[]>;
}

export const NOTIFICATION_STRATEGIES = Symbol('NOTIFICATION_STRATEGIES');
