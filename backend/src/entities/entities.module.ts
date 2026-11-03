import { Module } from '@nestjs/common';
import { EntitiesController } from './entities.controller';
import { EntitiesService } from './entities.service';
import { ScopeEngineService } from './scope-engine.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [WorkspacesModule],
  controllers: [EntitiesController],
  providers: [EntitiesService, ScopeEngineService],
  exports: [EntitiesService, ScopeEngineService],
})
export class EntitiesModule {}
