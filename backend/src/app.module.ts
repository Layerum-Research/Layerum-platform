import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { SupabaseModule } from './supabase/supabase.module';
import { CryptoModule } from './crypto/crypto.module';
import { VectorModule } from './vector/vector.module';
import { AuthModule } from './auth/auth.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { EntityTypesModule } from './entity-types/entity-types.module';
import { EntitiesModule } from './entities/entities.module';
import { ProviderConnectionsModule } from './provider-connections/provider-connections.module';
import { ModelDefinitionsModule } from './model-definitions/model-definitions.module';
import { ModelConfigsModule } from './model-configs/model-configs.module';
import { DataSourcesModule } from './data-sources/data-sources.module';
import { QueryModule } from './query/query.module';
import { UsageModule } from './usage/usage.module';
import { AuditModule } from './audit/audit.module';
import { WorkspaceApiKeysModule } from './workspace-api-keys/workspace-api-keys.module';
import { PublicApiModule } from './public-api/public-api.module';
import { WorkspaceEncryptionModule } from './workspace-encryption/workspace-encryption.module';
import { AiRuntimeModule } from './ai-runtime/ai-runtime.module';
import { StorageModule } from './storage/storage.module';
import { FeedbackRequestsModule } from './feedback-requests/feedback-requests.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ContactRequestsModule } from './contact-requests/contact-requests.module';
import { AsyncTasksModule } from './async-tasks/async-tasks.module';
import { InternalModule } from './internal/internal.module';
import { CommonAuthzModule } from './common/common-authz.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { AuthGuardModule } from './common/auth/auth-guard.module';
import { SystemHealthModule } from './system-health/system-health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OAuthModule } from './oauth/oauth.module';
import { ModelCatalogModule } from './model-catalog/model-catalog.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    RateLimitModule,
    CommonAuthzModule,
    AsyncTasksModule,
    SupabaseModule,
    AuthGuardModule,
    SystemHealthModule,
    NotificationsModule,
    OAuthModule,
    SubscriptionsModule,
    StorageModule,
    CryptoModule,
    VectorModule,
    AuthModule,
    WorkspacesModule,
    EntityTypesModule,
    EntitiesModule,
    ProviderConnectionsModule,
    ModelDefinitionsModule,
    ModelCatalogModule,
    ModelConfigsModule,
    DataSourcesModule,
    QueryModule,
    UsageModule,
    AuditModule,
    WorkspaceApiKeysModule,
    PublicApiModule,
    FeedbackRequestsModule,
    ContactRequestsModule,
    InternalModule,
    WorkspaceEncryptionModule,
    AiRuntimeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
