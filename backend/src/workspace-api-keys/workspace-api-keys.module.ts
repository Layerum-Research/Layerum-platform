import { Module } from '@nestjs/common';
import { WorkspaceApiKeysController } from './workspace-api-keys.controller';
import { WorkspaceApiKeysService } from './workspace-api-keys.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [WorkspacesModule],
  controllers: [WorkspaceApiKeysController],
  providers: [WorkspaceApiKeysService],
  exports: [WorkspaceApiKeysService],
})
export class WorkspaceApiKeysModule {}
