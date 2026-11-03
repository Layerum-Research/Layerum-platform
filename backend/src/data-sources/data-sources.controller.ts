import {
  Body,
  Controller,
  Delete,
  GoneException,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DataSourcesService } from './data-sources.service';
import { CreateDataSourceDto } from './dto/create-data-source.dto';
import { InitUploadDto } from './dto/init-upload.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowCliToken } from '../common/decorators/allow-cli-token.decorator';
import { WorkspacePermissionGuard } from '../common/guards/workspace-permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequireWorkspacePermission } from '../common/decorators/require-workspace-permission.decorator';

@ApiTags('data-sources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspacePermissionGuard)
@AllowCliToken()
@Controller('workspaces/:workspaceId/entities/:entityId/sources')
export class DataSourcesController {
  constructor(private readonly service: DataSourcesService) {}

  @Post()
  @RequireWorkspacePermission('data.manage')
  create(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDataSourceDto,
  ) {
    return this.service.create(workspaceId, entityId, user.id, dto);
  }

  @Post('/upload')
  @RequireWorkspacePermission('data.manage')
  upload() {
    throw new GoneException(
      'Direct upload endpoint is disabled. Use /upload/init and /upload/complete.',
    );
  }

  @Post('/upload/init')
  @RequireWorkspacePermission('data.manage')
  uploadInit(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: InitUploadDto,
  ) {
    return this.service.initUpload(workspaceId, entityId, user.id, dto);
  }

  @Post('/upload/complete')
  @RequireWorkspacePermission('data.manage')
  uploadComplete(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.service.completeUpload(workspaceId, entityId, user.id, dto);
  }

  @Get()
  @RequireWorkspacePermission('query.run')
  findAll(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
  ) {
    return this.service.findAll(workspaceId, entityId);
  }

  @Get('/all')
  @RequireWorkspacePermission('query.run')
  findAllInWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.service.findAll(workspaceId);
  }

  @Get(':id')
  @RequireWorkspacePermission('query.run')
  findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
    @Param('id') id: string,
  ) {
    return this.service.findOne(workspaceId, entityId, id);
  }

  @Get(':id/error')
  @RequireWorkspacePermission('query.run')
  getError(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
    @Param('id') id: string,
  ) {
    return this.service.getLatestError(workspaceId, entityId, id);
  }

  @Post(':id/retry')
  @RequireWorkspacePermission('data.manage')
  retry(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.retryIngestion(workspaceId, entityId, id, user.id);
  }

  @Delete(':id')
  @RequireWorkspacePermission('data.manage')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('entityId') entityId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.remove(workspaceId, entityId, id, user.id);
  }
}
