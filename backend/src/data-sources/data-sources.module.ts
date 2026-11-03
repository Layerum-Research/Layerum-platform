import { Module } from '@nestjs/common';
import { DataSourcesController } from './data-sources.controller';
import { DataSourcesService } from './data-sources.service';
import { IngestionService } from './ingestion.service';
import { ProviderConnectionsModule } from '../provider-connections/provider-connections.module';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [ProviderConnectionsModule, AiRuntimeModule, WorkspacesModule],
  controllers: [DataSourcesController],
  providers: [DataSourcesService, IngestionService],
  exports: [DataSourcesService],
})
export class DataSourcesModule {}
