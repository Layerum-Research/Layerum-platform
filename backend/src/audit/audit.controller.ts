import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { WorkspacePermissionGuard } from '../common/guards/workspace-permission.guard';
import { RequireWorkspacePermission } from '../common/decorators/require-workspace-permission.decorator';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspacePermissionGuard)
@Controller('workspaces/:workspaceId/audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  @RequireWorkspacePermission('audit.read')
  getLogs(@Param('workspaceId') workspaceId: string) {
    return this.service.getLogs(workspaceId);
  }
}
