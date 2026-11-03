import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EntitiesService } from './entities.service';
import { ScopeEngineService } from './scope-engine.service';
import { CreateEntityDto } from './dto/create-entity.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowCliToken } from '../common/decorators/allow-cli-token.decorator';
import { WorkspacePermissionGuard } from '../common/guards/workspace-permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequireWorkspacePermission } from '../common/decorators/require-workspace-permission.decorator';

@ApiTags('entities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspacePermissionGuard)
@Controller('workspaces/:workspaceId/entities')
export class EntitiesController {
  constructor(
    private readonly service: EntitiesService,
    private readonly scopeEngine: ScopeEngineService,
  ) {}

  @Post()
  @AllowCliToken()
  @RequireWorkspacePermission('data.manage')
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEntityDto,
  ) {
    return this.service.create(workspaceId, user.id, dto);
  }

  @Get()
  @AllowCliToken()
  @RequireWorkspacePermission('query.run')
  findAll(
    @Param('workspaceId') workspaceId: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.service.findAll(workspaceId, parentId);
  }

  @Get('tree')
  @AllowCliToken()
  @RequireWorkspacePermission('query.run')
  findTree(@Param('workspaceId') workspaceId: string) {
    return this.service.findTree(workspaceId);
  }

  @Get(':id')
  @AllowCliToken()
  @RequireWorkspacePermission('query.run')
  findOne(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.service.findOne(workspaceId, id);
  }

  @Get(':id/scope')
  @AllowCliToken()
  @RequireWorkspacePermission('query.run')
  resolveScope(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Query('includeParents') includeParents?: string,
  ) {
    return this.scopeEngine.resolveScope(
      workspaceId,
      id,
      includeParents !== 'false',
    );
  }

  @Patch(':id')
  @RequireWorkspacePermission('data.manage')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: Partial<CreateEntityDto>,
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
