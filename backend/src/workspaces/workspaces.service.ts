import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditService } from '../audit/audit.service';
import { VectorService } from '../vector/vector.service';
import { StorageService } from '../storage/storage.service';
import {
  SubscriptionsService,
  type WorkspaceUsageStat,
} from '../subscriptions/subscriptions.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import {
  WORKSPACE_PERMISSIONS,
  type WorkspacePermission,
  type CreateWorkspaceRoleDto,
} from './dto/create-workspace-role.dto';
import { UpdateWorkspaceRoleDto } from './dto/update-workspace-role.dto';
import { NotificationsService } from '../notifications/notifications.service';

type WorkspaceMemberRow = {
  id: string;
  role: string;
  created_at: string;
  workspace_role_id: string | null;
  user: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
};

type WorkspaceRoleRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

type WorkspaceRolePermissionRow = {
  role_id: string;
  permission: WorkspacePermission;
};

type WorkspaceInviteRow = {
  id: string;
  workspace_id: string;
  email: string;
  role_id: string;
  invited_by: string | null;
  token: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

type WorkspaceMembershipOverviewRow = {
  role: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    created_at: string;
    created_by: string;
  };
};

@Injectable()
export class WorkspacesService {
  constructor(
    private supabase: SupabaseService,
    private readonly audit: AuditService,
    private readonly vector: VectorService,
    private readonly storage: StorageService,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto) {
    try {
      await this.subscriptions.assertWorkspaceCreateAllowed(userId);

      const { data: existing } = await this.supabase.admin
        .from('workspaces')
        .select('id')
        .eq('slug', dto.slug)
        .single();

      if (existing) throw new ConflictException('Slug already taken');

      const { data: workspace, error } = await this.supabase.admin
        .from('workspaces')
        .insert({ ...dto, created_by: userId })
        .select()
        .single();

      if (error) throw new ConflictException(error.message);

      await this.supabase.admin.from('workspace_users').insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: 'owner',
      });

      await this.safeAudit({
        workspaceId: workspace.id,
        userId,
        action: 'create',
        resource: 'workspace',
        resourceId: workspace.id,
        metadata: { slug: workspace.slug, name: workspace.name },
      });

      return workspace;
    } catch (error) {
      await this.safeAudit({
        userId,
        action: 'create',
        resource: 'workspace',
        success: false,
        errorCode: this.errorCode(error),
        metadata: { slug: dto.slug, name: dto.name },
      });
      throw error;
    }
  }

  async findAllForUser(userId: string) {
    const { data, error } = await this.supabase.admin
      .from('workspace_users')
      .select(
        'role, workspace:workspaces(id, name, slug, logo_url, created_at)',
      )
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    return data;
  }

  async getOverview(userId: string) {
    const [memberships, subscription] = await Promise.all([
      this.supabase.admin
        .from('workspace_users')
        .select(
          'role, workspace:workspaces(id, name, slug, logo_url, created_at, created_by)',
        )
        .eq('user_id', userId)
        .returns<WorkspaceMembershipOverviewRow[]>(),
      this.subscriptions.resolveForUser(userId),
    ]);

    if (memberships.error) throw new Error(memberships.error.message);

    const items = memberships.data ?? [];
    const workspaceIds = items.map((item) => item.workspace.id);
    const stats = await this.subscriptions.listWorkspaceUsageStats(workspaceIds);
    const statsByWorkspaceId = new Map<string, WorkspaceUsageStat>(
      stats.map((entry) => [entry.workspaceId, entry]),
    );

    const ownedWorkspaceIds = items
      .filter((item) => item.workspace.created_by === userId)
      .map((item) => item.workspace.id);

    const ownedWorkspaceSet = new Set(ownedWorkspaceIds);
    const ownedUsageBytes = stats.reduce((sum, entry) => {
      if (!ownedWorkspaceSet.has(entry.workspaceId)) return sum;
      return sum + entry.usageBytes;
    }, 0);

    return {
      account: {
        plan: {
          code: subscription.planCode,
          name: subscription.planName,
        },
        limits: {
          workspaceLimit: subscription.workspaceLimit,
          capacityBytes: subscription.capacityBytes,
        },
        usage: {
          ownedWorkspaceCount: ownedWorkspaceIds.length,
          usedBytes: ownedUsageBytes,
          remainingBytes: Math.max(
            0,
            subscription.capacityBytes - ownedUsageBytes,
          ),
        },
      },
      items: items.map((item) => {
        const usage = statsByWorkspaceId.get(item.workspace.id);
        const usedBytes = usage?.usageBytes ?? 0;
        const isOwner = item.workspace.created_by === userId;
        const capacityBytes = isOwner ? subscription.capacityBytes : null;
        return {
          role: item.role,
          isOwner,
          workspace: {
            id: item.workspace.id,
            name: item.workspace.name,
            slug: item.workspace.slug,
            logo_url: item.workspace.logo_url,
            created_at: item.workspace.created_at,
          },
          metrics: {
            members: usage?.memberCount ?? 0,
            entities: usage?.entityCount ?? 0,
            documents: usage?.documentCount ?? 0,
            chunks: usage?.chunkCount ?? 0,
            usedBytes,
            capacityBytes,
            usagePercent:
              capacityBytes && capacityBytes > 0
                ? Math.min(100, Math.round((usedBytes / capacityBytes) * 100))
                : null,
          },
        };
      }),
    };
  }

  async findOne(workspaceId: string, userId: string) {
    await this.assertMembership(workspaceId, userId);

    const { data, error } = await this.supabase.admin
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .single();

    if (error || !data) throw new NotFoundException('Workspace not found');
    return data;
  }

  async findBySlug(slug: string, userId: string) {
    const { data, error } = await this.supabase.admin
      .from('workspaces')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !data) throw new NotFoundException('Workspace not found');
    await this.assertMembership(data.id, userId);
    return data;
  }

  async getMembers(workspaceId: string, userId: string) {
    await this.assertMembership(workspaceId, userId);

    const { data, error } = await this.supabase.admin
      .from('workspace_users')
      .select(
        'id, role, workspace_role_id, created_at, user:users!workspace_users_user_id_fkey(id, email, full_name, avatar_url)',
      )
      .eq('workspace_id', workspaceId)
      .returns<WorkspaceMemberRow[]>();

    if (error) throw new Error(error.message);
    const userIds = Array.from(
      new Set((data ?? []).map((member) => member.user?.id).filter(Boolean) as string[]),
    );
    const lastSeenMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: sessions, error: sessionsError } = await this.supabase.admin
        .from('user_sessions')
        .select('user_id, last_seen_at')
        .in('user_id', userIds)
        .is('revoked_at', null);
      if (sessionsError) throw new Error(sessionsError.message);
      for (const row of sessions ?? []) {
        const sessionUserId = (row as { user_id?: string }).user_id;
        const lastSeenAt = (row as { last_seen_at?: string }).last_seen_at;
        if (!sessionUserId || !lastSeenAt) continue;
        const previous = lastSeenMap.get(sessionUserId);
        if (!previous || Date.parse(lastSeenAt) > Date.parse(previous)) {
          lastSeenMap.set(sessionUserId, lastSeenAt);
        }
      }
    }
    const roleIds = Array.from(
      new Set((data ?? []).map((member) => member.workspace_role_id).filter(Boolean) as string[]),
    );
    const [roleMap, mfaEnrolledUserIds] = await Promise.all([
      this.getRoleMap(workspaceId, roleIds),
      this.getMfaEnrolledUserIds(userIds),
    ]);

    return Promise.all((data ?? []).map(async (member) => {
      const isOwner = member.role === 'owner';
      const avatarUrl = this.supabase.getPublicUrl(
        'sources',
        member.user?.avatar_url ?? '',
      );
      return {
        id: member.id,
        role: member.role,
        workspace_role_id: member.workspace_role_id,
        created_at: member.created_at,
        last_seen_at: member.user?.id ? (lastSeenMap.get(member.user.id) ?? null) : null,
        mfa_enabled: member.user?.id
          ? mfaEnrolledUserIds.has(member.user.id)
          : false,
        user: {
          ...member.user,
          avatar_url: avatarUrl,
        },
        isOwner,
        roleDefinition: isOwner
          ? {
              id: 'owner',
              name: 'Owner',
              description: 'System owner role with full control',
              isSystem: true,
              permissions: [...WORKSPACE_PERMISSIONS],
              assignedCount: null,
            }
          : member.workspace_role_id
            ? roleMap.get(member.workspace_role_id) ?? null
            : null,
      };
    }));
  }

  private async getMfaEnrolledUserIds(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const { data, error } = await this.supabase.admin.rpc(
      'users_mfa_enrolled',
      { p_user_ids: userIds },
    );
    if (error) throw new Error(error.message);
    return new Set((data ?? []).map((row) => row.user_id));
  }

  async inviteMember(
    workspaceId: string,
    inviterId: string,
    dto: InviteMemberDto,
  ) {
    try {
      const membership = await this.assertMembership(workspaceId, inviterId);
      const canManageMembers = await this.hasPermission(
        workspaceId,
        membership.user_id,
        'members.manage',
      );
      if (!canManageMembers) {
        throw new ForbiddenException('Missing permission: members.manage');
      }

      const role = await this.findRoleInWorkspace(workspaceId, dto.roleId);
      const email = dto.email.trim().toLowerCase();

      const { data: existingInvite, error: existingInviteError } =
        await this.supabase.admin
          .from('workspace_invites')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('email', email)
          .eq('status', 'pending')
          .maybeSingle();
      if (existingInviteError) throw new Error(existingInviteError.message);
      if (existingInvite) {
        throw new ConflictException('Pending invite already exists for this email');
      }

      const { data: user } = await this.supabase.admin
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (user?.id) {
        const { data: existingMember, error: existingMemberError } =
          await this.supabase.admin
            .from('workspace_users')
            .select('id')
            .eq('workspace_id', workspaceId)
            .eq('user_id', user.id)
            .maybeSingle();
        if (existingMemberError) throw new Error(existingMemberError.message);
        if (existingMember) {
          throw new ConflictException('User is already a member of this workspace');
        }
      }

      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const token = `wki_${randomBytes(24).toString('base64url')}`;
      const { data: invite, error } = await this.supabase.admin
        .from('workspace_invites')
        .insert({
          workspace_id: workspaceId,
          email,
          role_id: role.id,
          invited_by: inviterId,
          token,
          status: 'pending',
          expires_at: expiresAt,
        })
        .select('*')
        .single<WorkspaceInviteRow>();

      if (error || !invite) {
        throw new ConflictException(error?.message ?? 'Failed to create invite');
      }

      await this.safeAudit({
        workspaceId,
        userId: inviterId,
        action: 'create',
        resource: 'workspace_invite',
        resourceId: invite.id,
        metadata: { roleId: role.id, email },
      });
      return { success: true, inviteId: invite.id, expiresAt: invite.expires_at };
    } catch (error) {
      await this.safeAudit({
        workspaceId,
        userId: inviterId,
        action: 'create',
        resource: 'workspace_invite',
        success: false,
        errorCode: this.errorCode(error),
        metadata: { roleId: dto.roleId, email: dto.email },
      });
      throw error;
    }
  }

  async listInvites(workspaceId: string, userId: string) {
    const canManageMembers = await this.hasPermission(
      workspaceId,
      userId,
      'members.manage',
    );
    if (!canManageMembers) {
      throw new ForbiddenException('Missing permission: members.manage');
    }

    const { data, error } = await this.supabase.admin
      .from('workspace_invites')
      .select(
        'id, workspace_id, email, role_id, invited_by, status, expires_at, accepted_by, accepted_at, created_at, updated_at',
      )
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async revokeInvite(workspaceId: string, inviteId: string, userId: string) {
    try {
      const canManageMembers = await this.hasPermission(
        workspaceId,
        userId,
        'members.manage',
      );
      if (!canManageMembers) {
        throw new ForbiddenException('Missing permission: members.manage');
      }

      const { data: invite, error: loadError } = await this.supabase.admin
        .from('workspace_invites')
        .select('id, status')
        .eq('id', inviteId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (loadError) throw new Error(loadError.message);
      if (!invite) throw new NotFoundException('Invite not found');
      if (invite.status !== 'pending') {
        throw new BadRequestException('Only pending invites can be revoked');
      }

      const { error } = await this.supabase.admin
        .from('workspace_invites')
        .update({ status: 'revoked' })
        .eq('id', inviteId)
        .eq('workspace_id', workspaceId);
      if (error) throw new Error(error.message);

      await this.safeAudit({
        workspaceId,
        userId,
        action: 'delete',
        resource: 'workspace_invite',
        resourceId: inviteId,
      });
      return { success: true };
    } catch (error) {
      await this.safeAudit({
        workspaceId,
        userId,
        action: 'delete',
        resource: 'workspace_invite',
        resourceId: inviteId,
        success: false,
        errorCode: this.errorCode(error),
      });
      throw error;
    }
  }

  async resendInvite(workspaceId: string, inviteId: string, userId: string) {
    try {
      const canManageMembers = await this.hasPermission(
        workspaceId,
        userId,
        'members.manage',
      );
      if (!canManageMembers) {
        throw new ForbiddenException('Missing permission: members.manage');
      }

      const { data: invite, error: loadError } = await this.supabase.admin
        .from('workspace_invites')
        .select('id, status, email, role_id')
        .eq('id', inviteId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (loadError) throw new Error(loadError.message);
      if (!invite) throw new NotFoundException('Invite not found');
      if (invite.status !== 'pending') {
        throw new BadRequestException('Only pending invites can be resent');
      }

      const token = `wki_${randomBytes(24).toString('base64url')}`;
      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { error } = await this.supabase.admin
        .from('workspace_invites')
        .update({
          token,
          expires_at: expiresAt,
        })
        .eq('id', inviteId)
        .eq('workspace_id', workspaceId);
      if (error) throw new Error(error.message);

      await this.safeAudit({
        workspaceId,
        userId,
        action: 'update',
        resource: 'workspace_invite',
        resourceId: inviteId,
        metadata: { operation: 'resend', email: invite.email, roleId: invite.role_id },
      });
      return { success: true, inviteId, expiresAt };
    } catch (error) {
      await this.safeAudit({
        workspaceId,
        userId,
        action: 'update',
        resource: 'workspace_invite',
        resourceId: inviteId,
        success: false,
        errorCode: this.errorCode(error),
        metadata: { operation: 'resend' },
      });
      throw error;
    }
  }

  async acceptInviteByToken(token: string, userId: string) {
    try {
      const normalized = token.trim();
      const { data: invite, error } = await this.supabase.admin
        .from('workspace_invites')
        .select('*')
        .eq('token', normalized)
        .maybeSingle<WorkspaceInviteRow>();
      if (error) throw new Error(error.message);
      if (!invite) throw new NotFoundException('Invite not found');
      if (invite.status !== 'pending') {
        throw new BadRequestException('Invite is no longer pending');
      }
      if (Date.parse(invite.expires_at) <= Date.now()) {
        await this.supabase.admin
          .from('workspace_invites')
          .update({ status: 'expired' })
          .eq('id', invite.id);
        throw new BadRequestException('Invite has expired');
      }

      const { data: user, error: userError } = await this.supabase.admin
        .from('users')
        .select('id, email')
        .eq('id', userId)
        .maybeSingle();
      if (userError) throw new Error(userError.message);
      if (!user) throw new NotFoundException('User not found');

      if ((user.email ?? '').trim().toLowerCase() !== invite.email.trim().toLowerCase()) {
        throw new ForbiddenException('Invite email does not match current account');
      }

      const { data: existingMember, error: memberError } = await this.supabase.admin
        .from('workspace_users')
        .select('id')
        .eq('workspace_id', invite.workspace_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (memberError) throw new Error(memberError.message);

      if (!existingMember) {
        const role = await this.findRoleInWorkspace(invite.workspace_id, invite.role_id);
        const { error: insertError } = await this.supabase.admin
          .from('workspace_users')
          .insert({
            workspace_id: invite.workspace_id,
            user_id: userId,
            role: 'viewer',
            workspace_role_id: role.id,
            invited_by: invite.invited_by,
          });
        if (insertError) throw new Error(insertError.message);
      }

      const { error: inviteUpdateError } = await this.supabase.admin
        .from('workspace_invites')
        .update({
          status: 'accepted',
          accepted_by: userId,
          accepted_at: new Date().toISOString(),
        })
        .eq('id', invite.id);
      if (inviteUpdateError) throw new Error(inviteUpdateError.message);

      await this.safeAudit({
        workspaceId: invite.workspace_id,
        userId,
        action: 'create',
        resource: 'workspace_member',
        resourceId: userId,
        metadata: { acceptedInviteId: invite.id },
      });
      if (!existingMember && invite.invited_by) {
        await this.notifications.notify({
          type: 'workspace_invite_accepted',
          workspaceId: invite.workspace_id,
          inviterUserId: invite.invited_by,
          memberUserId: userId,
        });
      }

      return { success: true, workspaceId: invite.workspace_id };
    } catch (error) {
      await this.safeAudit({
        userId,
        action: 'create',
        resource: 'workspace_member',
        success: false,
        errorCode: this.errorCode(error),
        metadata: { source: 'workspace_invite_accept' },
      });
      throw error;
    }
  }

  async removeMember(workspaceId: string, userId: string, requesterId: string) {
    try {
      const requester = await this.assertMembership(workspaceId, requesterId);
      const canManageMembers = await this.hasPermission(
        workspaceId,
        requester.user_id,
        'members.manage',
      );
      if (!canManageMembers) {
        throw new ForbiddenException('Missing permission: members.manage');
      }

      if (userId === requesterId) {
        throw new BadRequestException(
          'You cannot remove yourself from workspace members',
        );
      }

    const { data: targetMember } = await this.supabase.admin
      .from('workspace_users')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (!targetMember) {
      throw new NotFoundException('Member not found');
    }

    if (targetMember.role === 'owner' && requester.role !== 'owner') {
      throw new ForbiddenException('Only owners can remove owners');
    }

    if (targetMember.role === 'owner') {
      const { count, error: ownerCountError } = await this.supabase.admin
        .from('workspace_users')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('role', 'owner');

      if (ownerCountError) throw new Error(ownerCountError.message);
      if ((count ?? 0) <= 1) {
        throw new BadRequestException(
          'Cannot remove the last owner from workspace',
        );
      }
    }

      await this.supabase.admin
        .from('workspace_users')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId);

      await this.safeAudit({
        workspaceId,
        userId: requesterId,
        action: 'delete',
        resource: 'workspace_member',
        resourceId: userId,
      });
      return { success: true };
    } catch (error) {
      await this.safeAudit({
        workspaceId,
        userId: requesterId,
        action: 'delete',
        resource: 'workspace_member',
        resourceId: userId,
        success: false,
        errorCode: this.errorCode(error),
      });
      throw error;
    }
  }

  async assertMembership(workspaceId: string, userId: string) {
    const { data } = await this.supabase.admin
      .from('workspace_users')
      .select('user_id, role, workspace_role_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (!data) throw new ForbiddenException('Not a workspace member');
    return data;
  }

  async assertOwner(workspaceId: string, userId: string) {
    const membership = await this.assertMembership(workspaceId, userId);
    if (membership.role !== 'owner') {
      throw new ForbiddenException('Only workspace owner can view usage data');
    }
    return membership;
  }

  async listRoles(workspaceId: string, userId: string) {
    await this.assertMembership(workspaceId, userId);
    const roleMap = await this.getRoleMap(workspaceId);
    return Array.from(roleMap.values());
  }

  async createRole(workspaceId: string, userId: string, dto: CreateWorkspaceRoleDto) {
    try {
      const canManageMembers = await this.hasPermission(workspaceId, userId, 'members.manage');
      if (!canManageMembers) {
        throw new ForbiddenException('Missing permission: members.manage');
      }

    const { data: role, error } = await this.supabase.admin
      .from('workspace_roles')
      .insert({
        workspace_id: workspaceId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        is_system: false,
      })
      .select('*')
      .single<WorkspaceRoleRow>();

    if (error || !role) throw new ConflictException(error?.message ?? 'Failed to create role');

    if (dto.permissions.length > 0) {
      const { error: permsError } = await this.supabase.admin
        .from('workspace_role_permissions')
        .insert(dto.permissions.map((permission) => ({ role_id: role.id, permission })));
      if (permsError) throw new ConflictException(permsError.message);
    }

    const roleMap = await this.getRoleMap(workspaceId, [role.id]);
      const createdRole = roleMap.get(role.id);
      await this.safeAudit({
        workspaceId,
        userId,
        action: 'create',
        resource: 'workspace_role',
        resourceId: role.id,
        metadata: { name: dto.name, permissions: dto.permissions.length },
      });
      return createdRole;
    } catch (error) {
      await this.safeAudit({
        workspaceId,
        userId,
        action: 'create',
        resource: 'workspace_role',
        success: false,
        errorCode: this.errorCode(error),
        metadata: { name: dto.name },
      });
      throw error;
    }
  }

  async updateRole(
    workspaceId: string,
    roleId: string,
    userId: string,
    dto: UpdateWorkspaceRoleDto,
  ) {
    try {
      const canManageMembers = await this.hasPermission(workspaceId, userId, 'members.manage');
      if (!canManageMembers) {
        throw new ForbiddenException('Missing permission: members.manage');
      }
      const role = await this.findRoleInWorkspace(workspaceId, roleId);
      if (role.is_system) {
        throw new BadRequestException('System roles cannot be modified');
      }

    if (dto.name || dto.description !== undefined) {
      const { error: updateError } = await this.supabase.admin
        .from('workspace_roles')
        .update({
          name: dto.name?.trim() ?? role.name,
          description: dto.description?.trim() || null,
        })
        .eq('id', roleId)
        .eq('workspace_id', workspaceId);
      if (updateError) throw new ConflictException(updateError.message);
    }

    if (dto.permissions) {
      await this.supabase.admin
        .from('workspace_role_permissions')
        .delete()
        .eq('role_id', roleId);

      if (dto.permissions.length > 0) {
        const { error: permError } = await this.supabase.admin
          .from('workspace_role_permissions')
          .insert(dto.permissions.map((permission) => ({ role_id: roleId, permission })));
        if (permError) throw new ConflictException(permError.message);
      }
    }

      const roleMap = await this.getRoleMap(workspaceId, [roleId]);
      const updatedRole = roleMap.get(roleId);
      await this.safeAudit({
        workspaceId,
        userId,
        action: 'update',
        resource: 'workspace_role',
        resourceId: roleId,
        metadata: { fields: Object.keys(dto) },
      });
      return updatedRole;
    } catch (error) {
      await this.safeAudit({
        workspaceId,
        userId,
        action: 'update',
        resource: 'workspace_role',
        resourceId: roleId,
        success: false,
        errorCode: this.errorCode(error),
      });
      throw error;
    }
  }

  async deleteRole(workspaceId: string, roleId: string, userId: string) {
    try {
      const canManageMembers = await this.hasPermission(workspaceId, userId, 'members.manage');
      if (!canManageMembers) {
        throw new ForbiddenException('Missing permission: members.manage');
      }
      const role = await this.findRoleInWorkspace(workspaceId, roleId);
      if (role.is_system) {
        throw new BadRequestException('System roles cannot be deleted');
      }

    const { count, error: countError } = await this.supabase.admin
      .from('workspace_users')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('workspace_role_id', roleId);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) {
      throw new BadRequestException('Cannot delete a role that is assigned to members');
    }

    const { count: pendingInviteCount, error: pendingInviteError } = await this.supabase.admin
      .from('workspace_invites')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('role_id', roleId)
      .eq('status', 'pending');
    if (pendingInviteError) throw new Error(pendingInviteError.message);
    if ((pendingInviteCount ?? 0) > 0) {
      throw new BadRequestException('Cannot delete a role that is assigned to pending invites');
    }

    const { error } = await this.supabase.admin
      .from('workspace_roles')
      .delete()
      .eq('id', roleId)
      .eq('workspace_id', workspaceId);
    if (error) throw new Error(error.message);

      await this.safeAudit({
        workspaceId,
        userId,
        action: 'delete',
        resource: 'workspace_role',
        resourceId: roleId,
      });
      return { success: true };
    } catch (error) {
      await this.safeAudit({
        workspaceId,
        userId,
        action: 'delete',
        resource: 'workspace_role',
        resourceId: roleId,
        success: false,
        errorCode: this.errorCode(error),
      });
      throw error;
    }
  }

  async removeWorkspace(workspaceId: string, userId: string) {
    try {
      const membership = await this.assertMembership(workspaceId, userId);
      if (membership.role !== 'owner') {
        throw new ForbiddenException('Only workspace owners can delete workspace');
      }

      const { data: workspace, error: workspaceError } = await this.supabase.admin
        .from('workspaces')
        .select('id, name, slug')
        .eq('id', workspaceId)
        .single();
      if (workspaceError || !workspace) {
        throw new NotFoundException('Workspace not found');
      }

      await this.cleanupWorkspaceVectors(workspaceId);
      await this.cleanupWorkspaceStorage(workspaceId);

      const { error: deleteError } = await this.supabase.admin
        .from('workspaces')
        .delete()
        .eq('id', workspaceId);
      if (deleteError) throw new Error(deleteError.message);

      await this.safeAudit({
        userId,
        action: 'delete',
        resource: 'workspace',
        resourceId: workspaceId,
        metadata: {
          deletedWorkspaceId: workspaceId,
          deletedWorkspaceName: workspace.name,
          deletedWorkspaceSlug: workspace.slug,
        },
      });
      return { success: true };
    } catch (error) {
      await this.safeAudit({
        workspaceId,
        userId,
        action: 'delete',
        resource: 'workspace',
        resourceId: workspaceId,
        success: false,
        errorCode: this.errorCode(error),
      });
      throw error;
    }
  }

  async hasPermission(workspaceId: string, userId: string, permission: WorkspacePermission) {
    const membership = await this.assertMembership(workspaceId, userId);
    if (membership.role === 'owner') return true;
    const roleId = membership.workspace_role_id as string | null;
    if (roleId) {
      const { data, error } = await this.supabase.admin
        .from('workspace_role_permissions')
        .select('permission')
        .eq('role_id', roleId)
        .eq('permission', permission)
        .single();
      if (error && !error.message.toLowerCase().includes('no rows')) {
        throw new Error(error.message);
      }
      return Boolean(data);
    }

    return this.hasLegacyPermission(membership.role as string, permission);
  }

  private hasLegacyPermission(role: string, permission: WorkspacePermission) {
    const legacyMap: Record<string, WorkspacePermission[]> = {
      owner: [...WORKSPACE_PERMISSIONS],
      admin: [...WORKSPACE_PERMISSIONS],
      editor: ['models.manage', 'data.manage', 'query.run'],
      viewer: ['query.run'],
      api_only: ['query.run'],
    };
    return (legacyMap[role] ?? []).includes(permission);
  }

  private async findRoleInWorkspace(workspaceId: string, roleId: string) {
    const { data, error } = await this.supabase.admin
      .from('workspace_roles')
      .select('*')
      .eq('id', roleId)
      .eq('workspace_id', workspaceId)
      .single<WorkspaceRoleRow>();
    if (error || !data) throw new NotFoundException('Role not found');
    return data;
  }

  private async getRoleMap(workspaceId: string, roleIds?: string[]) {
    let rolesQuery = this.supabase.admin
      .from('workspace_roles')
      .select('*')
      .eq('workspace_id', workspaceId);
    if (roleIds && roleIds.length > 0) {
      rolesQuery = rolesQuery.in('id', roleIds);
    }
    const { data: roles, error: rolesError } = await rolesQuery.returns<WorkspaceRoleRow[]>();
    if (rolesError) throw new Error(rolesError.message);

    const ids = (roles ?? []).map((role) => role.id);
    let permissionRows: WorkspaceRolePermissionRow[] = [];
    if (ids.length > 0) {
      const { data, error } = await this.supabase.admin
        .from('workspace_role_permissions')
        .select('role_id, permission')
        .in('role_id', ids)
        .returns<WorkspaceRolePermissionRow[]>();
      if (error) throw new Error(error.message);
      permissionRows = data ?? [];
    }

    const { data: assignedRows, error: assignedError } = await this.supabase.admin
      .from('workspace_users')
      .select('workspace_role_id')
      .eq('workspace_id', workspaceId)
      .not('workspace_role_id', 'is', null);
    if (assignedError) throw new Error(assignedError.message);

    const assignedCountByRole = new Map<string, number>();
    for (const row of assignedRows ?? []) {
      const roleId = (row as { workspace_role_id: string | null }).workspace_role_id;
      if (!roleId) continue;
      assignedCountByRole.set(roleId, (assignedCountByRole.get(roleId) ?? 0) + 1);
    }

    const permissionsByRole = new Map<string, WorkspacePermission[]>();
    for (const row of permissionRows) {
      const current = permissionsByRole.get(row.role_id) ?? [];
      current.push(row.permission);
      permissionsByRole.set(row.role_id, current);
    }

    return new Map(
      (roles ?? []).map((role) => [
        role.id,
        {
          id: role.id,
          name: role.name,
          description: role.description,
          isSystem: role.is_system,
          permissions: permissionsByRole.get(role.id) ?? [],
          assignedCount: assignedCountByRole.get(role.id) ?? 0,
          createdAt: role.created_at,
          updatedAt: role.updated_at,
        },
      ]),
    );
  }

  private async cleanupWorkspaceVectors(workspaceId: string) {
    const { data: rows, error } = await this.supabase.admin
      .from('vector_records')
      .select('collection_name, vector_point_id')
      .eq('workspace_id', workspaceId);
    if (error) throw new Error(error.message);

    const pointsByCollection = new Map<string, string[]>();
    for (const row of rows ?? []) {
      const collectionName = (row as { collection_name?: string | null }).collection_name;
      const pointId = (row as { vector_point_id?: string | null }).vector_point_id;
      if (!collectionName || !pointId) continue;
      if (!pointsByCollection.has(collectionName)) {
        pointsByCollection.set(collectionName, []);
      }
      pointsByCollection.get(collectionName)!.push(pointId);
    }

    for (const [collectionName, pointIds] of pointsByCollection) {
      for (let i = 0; i < pointIds.length; i += 256) {
        await this.vector.deletePoints(collectionName, pointIds.slice(i, i + 256));
      }
    }
  }

  private async cleanupWorkspaceStorage(workspaceId: string) {
    const { data: rows, error } = await this.supabase.admin
      .from('data_sources')
      .select('storage_path, storage_backend')
      .eq('workspace_id', workspaceId)
      .eq('storage_backend', 's3')
      .not('storage_path', 'is', null);
    if (error) throw new Error(error.message);

    const paths = Array.from(
      new Set(
        (rows ?? [])
          .map((row) => (row as { storage_path?: string | null }).storage_path)
          .filter((value): value is string => Boolean(value && value.trim())),
      ),
    );
    if (paths.length === 0) return;

    await this.storage.deleteObjects(paths);
  }

  private errorCode(error: unknown) {
    if (error instanceof Error && error.name) return error.name;
    return 'UnknownError';
  }

  private async safeAudit(input: Parameters<AuditService['logAction']>[0]) {
    try {
      await this.audit.logAction(input);
    } catch {}
  }
}
