import { Module } from '@nestjs/common';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { WorkspaceApiKeysModule } from '../workspace-api-keys/workspace-api-keys.module';
import { QueryModule } from '../query/query.module';
import { EntitiesModule } from '../entities/entities.module';
import { EntityTypesModule } from '../entity-types/entity-types.module';
import { DataSourcesModule } from '../data-sources/data-sources.module';
import { ModelDefinitionsModule } from '../model-definitions/model-definitions.module';
import { ProviderConnectionsModule } from '../provider-connections/provider-connections.module';
import { ModelConfigsModule } from '../model-configs/model-configs.module';
import { ApiKeyAuthGuard } from '../common/guards/api-key-auth.guard';

@Module({
  imports: [
    WorkspaceApiKeysModule,
    QueryModule,
    EntitiesModule,
    EntityTypesModule,
    DataSourcesModule,
    ModelDefinitionsModule,
    ProviderConnectionsModule,
    ModelConfigsModule,
  ],
  controllers: [PublicApiController],
  providers: [PublicApiService, ApiKeyAuthGuard],
})
export class PublicApiModule {}
