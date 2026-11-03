import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { QueryService } from './query.service';
import { QueryRequestDto } from './dto/query-request.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowCliToken } from '../common/decorators/allow-cli-token.decorator';
import { WorkspacePermissionGuard } from '../common/guards/workspace-permission.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequireWorkspacePermission } from '../common/decorators/require-workspace-permission.decorator';

@ApiTags('query')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspacePermissionGuard)
@AllowCliToken()
@Controller('query')
export class QueryController {
  constructor(private readonly service: QueryService) {}

  @Post()
  @RequireWorkspacePermission('query.run')
  query(@CurrentUser() user: AuthUser, @Body() dto: QueryRequestDto) {
    return this.service.query(user.id, dto);
  }

  @Post('debug')
  @RequireWorkspacePermission('query.run')
  queryDebug(@CurrentUser() user: AuthUser, @Body() dto: QueryRequestDto) {
    return this.service.query(user.id, { ...dto, debug: true });
  }
}
