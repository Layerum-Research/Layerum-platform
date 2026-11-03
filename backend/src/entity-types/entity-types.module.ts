import { Module } from '@nestjs/common';
import { EntityTypesController } from './entity-types.controller';
import { EntityTypesService } from './entity-types.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [WorkspacesModule],
  controllers: [EntityTypesController],
  providers: [EntityTypesService],
  exports: [EntityTypesService],
})
export class EntityTypesModule {}
