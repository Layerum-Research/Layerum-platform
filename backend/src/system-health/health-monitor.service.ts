import { Injectable } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import type { NotificationEvent } from '../notifications/domain/notification.types';
import { SystemHealthService } from './system-health.service';
import {
  HealthTransitionTracker,
  type HealthTransition,
} from './health-transition.tracker';
import type { HealthComponentName } from './system-health.types';

const COMPONENTS_WITHOUT_DOWN_ALERT: ReadonlySet<HealthComponentName> = new Set(
  ['database'],
);

@Injectable()
export class HealthMonitorService {
  private readonly tracker = new HealthTransitionTracker();

  constructor(
    private readonly systemHealth: SystemHealthService,
    private readonly notifications: NotificationsService,
  ) {}

  async tick() {
    const components = await Promise.all([
      this.systemHealth.checkDatabase(),
      this.systemHealth.checkQdrant(),
      this.systemHealth.checkRedis(),
    ]);
    const now = new Date();

    for (const component of components) {
      const transition = this.tracker.observe(
        component.name,
        component.status,
        now,
      );
      const event = transition ? this.toEvent(transition) : null;
      if (event) await this.notifications.notify(event);
    }
  }

  private toEvent(transition: HealthTransition): NotificationEvent | null {
    if (transition.kind === 'recovered') {
      return {
        type: 'system_health_recovered',
        component: transition.component,
        downSince: transition.downSince.toISOString(),
        recoveredAt: transition.recoveredAt.toISOString(),
      };
    }
    if (COMPONENTS_WITHOUT_DOWN_ALERT.has(transition.component)) return null;
    return {
      type: 'system_health_down',
      component: transition.component,
      since: transition.since.toISOString(),
    };
  }
}
