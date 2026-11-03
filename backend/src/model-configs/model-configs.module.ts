import { Module } from '@nestjs/common';
import { ModelConfigsController } from './model-configs.controller';
import { ModelConfigsService } from './model-configs.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [WorkspacesModule],
  controllers: [ModelConfigsController],
  providers: [ModelConfigsService],
  exports: [ModelConfigsService],
})
export class ModelConfigsModule {}
