import { Module } from '@nestjs/common';
import { ProviderConnectionsController } from './provider-connections.controller';
import { ProviderConnectionsService } from './provider-connections.service';
import { AiRuntimeModule } from '../ai-runtime/ai-runtime.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [AiRuntimeModule, WorkspacesModule],
  controllers: [ProviderConnectionsController],
  providers: [ProviderConnectionsService],
  exports: [ProviderConnectionsService],
})
export class ProviderConnectionsModule {}
