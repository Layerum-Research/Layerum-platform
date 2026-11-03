import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationStrategyRegistry } from './notification-strategy.registry';
import { NOTIFICATION_STRATEGIES } from './domain/notification.strategy';
import {
  NotificationDirectory,
  NotificationPreferencesRepository,
  NotificationRepository,
} from './domain/ports';
import { EmailModule } from '../email/email.module';
import { SupabaseNotificationRepository } from './infrastructure/supabase-notification.repository';
import { SupabaseNotificationDirectory } from './infrastructure/supabase-notification.directory';
import { SupabaseNotificationPreferencesRepository } from './infrastructure/supabase-notification-preferences.repository';
import { ApiKeyLifecycleStrategy } from './strategies/api-key-lifecycle.strategy';
import { ApiKeyTokenUsageStrategy } from './strategies/api-key-token-usage.strategy';
import { InviteAcceptedStrategy } from './strategies/invite-accepted.strategy';
import { IngestionFailedStrategy } from './strategies/ingestion-failed.strategy';
import { StorageQuotaStrategy } from './strategies/storage-quota.strategy';
import { SystemHealthStrategy } from './strategies/system-health.strategy';

const STRATEGIES = [
  ApiKeyLifecycleStrategy,
  ApiKeyTokenUsageStrategy,
  InviteAcceptedStrategy,
  IngestionFailedStrategy,
  StorageQuotaStrategy,
  SystemHealthStrategy,
];

@Global()
@Module({
  imports: [EmailModule],
  controllers: [NotificationsController],
  providers: [
    {
      provide: NotificationRepository,
      useClass: SupabaseNotificationRepository,
    },
    { provide: NotificationDirectory, useClass: SupabaseNotificationDirectory },
    {
      provide: NotificationPreferencesRepository,
      useClass: SupabaseNotificationPreferencesRepository,
    },
    ...STRATEGIES,
    {
      provide: NOTIFICATION_STRATEGIES,
      useFactory: (
        ...strategies: InstanceType<(typeof STRATEGIES)[number]>[]
      ) => strategies,
      inject: STRATEGIES,
    },
    NotificationStrategyRegistry,
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
