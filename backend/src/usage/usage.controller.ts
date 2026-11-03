import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsageService } from './usage.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('usage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/usage')
export class UsageController {
  constructor(private readonly service: UsageService) {}

  @Get()
  getSummary(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getSummary(workspaceId, user.id);
  }

  @Get('query-logs')
  getQueryLogs(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ) {
    return this.service.getQueryLogs(
      workspaceId,
      user.id,
      limit ? parseInt(limit) : 50,
    );
  }

  @Get('dashboard')
  getDashboard(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthUser,
    @Query('days') days?: string,
  ) {
    return this.service.getDashboardAnalytics(
      workspaceId,
      user.id,
      days ? parseInt(days, 10) : undefined,
    );
  }
}
