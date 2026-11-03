import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { WorkspacePermission } from '../../workspaces/dto/create-workspace-role.dto';
import { WorkspacesService } from '../../workspaces/workspaces.service';
import { WORKSPACE_PERMISSION_KEY } from '../decorators/require-workspace-permission.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

type RequestWithWorkspace = {
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  user?: AuthUser;
};

@Injectable()
export class WorkspacePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly workspaces: WorkspacesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithWorkspace>();
    const permission = this.reflector.getAllAndOverride<
      WorkspacePermission | undefined
    >(WORKSPACE_PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    const workspaceId = this.extractWorkspaceId(request);
    if (!workspaceId) {
      if (permission) {
        throw new BadRequestException('workspaceId is required');
      }
      return true;
    }

    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    await this.workspaces.assertMembership(workspaceId, userId);
    if (!permission) return true;

    const allowed = await this.workspaces.hasPermission(
      workspaceId,
      userId,
      permission,
    );
    if (!allowed) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }

    return true;
  }

  private extractWorkspaceId(request: RequestWithWorkspace): string | null {
    const fromParams = request.params?.workspaceId;
    if (typeof fromParams === 'string' && fromParams.trim()) {
      return fromParams.trim();
    }

    const fromBody = request.body?.workspaceId;
    if (typeof fromBody === 'string' && fromBody.trim()) {
      return fromBody.trim();
    }

    const fromQuery = request.query?.workspaceId;
    if (typeof fromQuery === 'string' && fromQuery.trim()) {
      return fromQuery.trim();
    }

    return null;
  }
}
