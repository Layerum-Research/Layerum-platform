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
import { EntityTypesService } from './entity-types.service';
import { CreateEntityTypeDto } from './dto/create-entity-type.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowCliToken } from '../common/decorators/allow-cli-token.decorator';
import { WorkspacePermissionGuard } from '../common/guards/workspace-permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequireWorkspacePermission } from '../common/decorators/require-workspace-permission.decorator';

@ApiTags('entity-types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspacePermissionGuard)
@Controller('workspaces/:workspaceId/entity-types')
export class EntityTypesController {
  constructor(private readonly service: EntityTypesService) {}

  @Post()
  @RequireWorkspacePermission('data.manage')
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEntityTypeDto,
  ) {
    return this.service.create(workspaceId, user.id, dto);
  }

  @Get()
  @AllowCliToken()
  @RequireWorkspacePermission('query.run')
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.service.findAll(workspaceId);
  }

  @Get(':id')
  @AllowCliToken()
  @RequireWorkspacePermission('query.run')
  findOne(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.service.findOne(workspaceId, id);
  }

  @Patch(':id')
  @RequireWorkspacePermission('data.manage')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: Partial<CreateEntityTypeDto>,
  ) {
    return this.service.update(workspaceId, id, user.id, dto);
  }

  @Delete(':id')
  @RequireWorkspacePermission('data.manage')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.remove(workspaceId, id, user.id);
  }
}
