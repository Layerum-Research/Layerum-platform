import { Module } from '@nestjs/common';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { EntitiesModule } from '../entities/entities.module';
import { ProviderConnectionsModule } from '../provider-connections/provider-connections.module';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [
    EntitiesModule,
    ProviderConnectionsModule,
    AiRuntimeModule,
    WorkspacesModule,
  ],
  controllers: [QueryController],
  providers: [QueryService],
  exports: [QueryService],
})
export class QueryModule {}
