import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProviderConnectionsService } from './provider-connections.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { WorkspacePermissionGuard } from '../common/guards/workspace-permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequireWorkspacePermission } from '../common/decorators/require-workspace-permission.decorator';

@ApiTags('providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspacePermissionGuard)
@Controller('workspaces/:workspaceId/providers')
export class ProviderConnectionsController {
  constructor(private readonly service: ProviderConnectionsService) {}

  @Post()
  @RequireWorkspacePermission('providers.manage')
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProviderDto,
  ) {
    return this.service.create(workspaceId, user.id, dto);
  }

  @Get()
  @RequireWorkspacePermission('providers.manage')
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.service.findAll(workspaceId);
  }

  @Get(':id')
  @RequireWorkspacePermission('providers.manage')
  findOne(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.service.findOne(workspaceId, id);
  }

  @Post(':id/test')
  @RequireWorkspacePermission('providers.manage')
  test(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.testConnection(workspaceId, id, user.id);
  }

  @Patch(':id')
  @RequireWorkspacePermission('providers.manage')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProviderDto,
  ) {
    return this.service.setActive(workspaceId, id, user.id, dto.is_active);
  }

  @Delete(':id')
  @RequireWorkspacePermission('providers.manage')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.remove(workspaceId, id, user.id);
  }
}
