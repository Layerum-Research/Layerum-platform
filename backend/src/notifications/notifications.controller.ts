import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { NotificationScopeDto } from './dto/notification-scope.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() scope: NotificationScopeDto) {
    return this.service.listUnread(user.id, scope.workspaceId ?? null);
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.service.getPreferences(user.id);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.service.updatePreferences(user.id, dto);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.markRead(user.id, id);
  }

  @Post('read-all')
  markAllRead(
    @CurrentUser() user: AuthUser,
    @Body() scope: NotificationScopeDto,
  ) {
    return this.service.markAllRead(user.id, scope.workspaceId ?? null);
  }
}
