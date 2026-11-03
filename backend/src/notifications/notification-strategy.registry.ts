import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_STRATEGIES,
  type NotificationStrategy,
} from './domain/notification.strategy';
import type {
  NotificationEvent,
  NotificationType,
} from './domain/notification.types';

@Injectable()
export class NotificationStrategyRegistry {
  private readonly strategies = new Map<
    NotificationType,
    NotificationStrategy
  >();

  constructor(
    @Inject(NOTIFICATION_STRATEGIES) strategies: NotificationStrategy[],
  ) {
    for (const strategy of strategies) {
      for (const type of strategy.types) {
        this.strategies.set(type, strategy);
      }
    }
  }

  resolve(event: NotificationEvent): NotificationStrategy {
    const strategy = this.strategies.get(event.type);
    if (!strategy) {
      throw new Error(`No notification strategy for type: ${event.type}`);
    }
    return strategy;
  }
}
