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
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { CreateWorkspaceRoleDto } from './dto/create-workspace-role.dto';
import { UpdateWorkspaceRoleDto } from './dto/update-workspace-role.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowCliToken } from '../common/decorators/allow-cli-token.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly service: WorkspacesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @AllowCliToken()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAllForUser(user.id);
  }

  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.service.getOverview(user.id);
  }

  @Get(':id')
  @AllowCliToken()
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user.id);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    return this.service.findBySlug(slug, user.id);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getMembers(id, user.id);
  }

  @Post(':id/members')
  inviteMember(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: InviteMemberDto,
  ) {
    return this.service.inviteMember(id, user.id, dto);
  }

  @Get(':id/invites')
  listInvites(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.listInvites(id, user.id);
  }

  @Delete(':id/invites/:inviteId')
  revokeInvite(
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.revokeInvite(id, inviteId, user.id);
  }

  @Post(':id/invites/:inviteId/resend')
  resendInvite(
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.resendInvite(id, inviteId, user.id);
  }

  @Post('invites/:token/accept')
  acceptInvite(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    return this.service.acceptInviteByToken(token, user.id);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeMember(id, userId, user.id);
  }

  @Get(':id/roles')
  listRoles(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.listRoles(id, user.id);
  }

  @Post(':id/roles')
  createRole(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWorkspaceRoleDto,
  ) {
    return this.service.createRole(id, user.id, dto);
  }

  @Patch(':id/roles/:roleId')
  updateRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateWorkspaceRoleDto,
  ) {
    return this.service.updateRole(id, roleId, user.id, dto);
  }

  @Delete(':id/roles/:roleId')
  deleteRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.deleteRole(id, roleId, user.id);
  }

  @Delete(':id')
  removeWorkspace(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeWorkspace(id, user.id);
  }
}
