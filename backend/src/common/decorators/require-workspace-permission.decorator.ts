import { SetMetadata } from '@nestjs/common';
import type { WorkspacePermission } from '../../workspaces/dto/create-workspace-role.dto';

export const WORKSPACE_PERMISSION_KEY = 'workspace_permission';

export const RequireWorkspacePermission = (permission: WorkspacePermission) =>
  SetMetadata(WORKSPACE_PERMISSION_KEY, permission);
