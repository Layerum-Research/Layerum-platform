import { Global, Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { WorkspacePermissionGuard } from './guards/workspace-permission.guard';

@Global()
@Module({
  imports: [WorkspacesModule],
  providers: [WorkspacePermissionGuard],
  exports: [WorkspacePermissionGuard],
})
export class CommonAuthzModule {}
