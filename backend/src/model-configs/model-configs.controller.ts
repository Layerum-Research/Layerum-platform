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
import { ModelConfigsService } from './model-configs.service';
import { CreateModelConfigDto } from './dto/create-model-config.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowCliToken } from '../common/decorators/allow-cli-token.decorator';
import { WorkspacePermissionGuard } from '../common/guards/workspace-permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequireWorkspacePermission } from '../common/decorators/require-workspace-permission.decorator';

@ApiTags('model-configs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspacePermissionGuard)
@Controller('workspaces/:workspaceId/model-configs')
export class ModelConfigsController {
  constructor(private readonly service: ModelConfigsService) {}

  @Post()
  @RequireWorkspacePermission('models.manage')
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateModelConfigDto,
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
    return this.service.findOneInWorkspace(workspaceId, id);
  }

  @Patch(':id')
  @RequireWorkspacePermission('models.manage')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: Partial<CreateModelConfigDto>,
  ) {
    return this.service.update(workspaceId, id, user.id, dto);
  }

  @Delete(':id')
  @RequireWorkspacePermission('models.manage')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.remove(workspaceId, id, user.id);
  }
}
