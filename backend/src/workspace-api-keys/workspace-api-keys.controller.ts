import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { WorkspaceApiKeysService } from './workspace-api-keys.service';
import { CreateWorkspaceApiKeyDto } from './dto/create-workspace-api-key.dto';
import { UpdateWorkspaceApiKeyDto } from './dto/update-workspace-api-key.dto';

@ApiTags('workspace-api-keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/api-keys')
export class WorkspaceApiKeysController {
  constructor(private readonly service: WorkspaceApiKeysService) {}

  @Post()
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWorkspaceApiKeyDto,
  ) {
    return this.service.create(workspaceId, user.id, dto);
  }

  @Get()
  list(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.list(workspaceId, user.id);
  }

  @Patch(':id')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateWorkspaceApiKeyDto,
  ) {
    return this.service.update(workspaceId, id, user.id, dto);
  }

  @Post(':id/revoke')
  revoke(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.revoke(workspaceId, id, user.id);
  }

  @Post(':id/rotate')
  rotate(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.rotate(workspaceId, id, user.id);
  }
}
