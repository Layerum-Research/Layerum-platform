import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { NotificationDirectory, type RankedMember } from '../domain/ports';
import { workspaceRankOf } from '../domain/workspace-rank';

type MemberRow = {
  user_id: string;
  role: string;
  workspace_role_id: string | null;
  workspace_role: { name: string; is_system: boolean } | null;
};

@Injectable()
export class SupabaseNotificationDirectory extends NotificationDirectory {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async listRankedMembers(workspaceId: string): Promise<RankedMember[]> {
    const { data, error } = await this.supabase.admin
      .from('workspace_users')
      .select(
        'user_id, role, workspace_role_id, workspace_role:workspace_roles(name, is_system)',
      )
      .eq('workspace_id', workspaceId)
      .returns<MemberRow[]>();
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      userId: row.user_id,
      rank: workspaceRankOf({
        legacyRole: row.role,
        roleName: row.workspace_role?.name ?? null,
        roleIsSystem: row.workspace_role?.is_system ?? false,
        hasCustomRole: Boolean(row.workspace_role_id),
      }),
    }));
  }

  async getWorkspaceName(workspaceId: string) {
    const { data, error } = await this.supabase.admin
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .maybeSingle<{ name: string }>();
    if (error) throw new Error(error.message);
    return data?.name ?? null;
  }

  async getWorkspaceOwnerId(workspaceId: string) {
    const { data, error } = await this.supabase.admin
      .from('workspaces')
      .select('created_by')
      .eq('id', workspaceId)
      .maybeSingle<{ created_by: string | null }>();
    if (error) throw new Error(error.message);
    return data?.created_by ?? null;
  }

  async getUserDisplayName(userId: string) {
    const { data, error } = await this.supabase.admin
      .from('users')
      .select('full_name, email')
      .eq('id', userId)
      .maybeSingle<{ full_name: string | null; email: string }>();
    if (error) throw new Error(error.message);
    return data?.full_name?.trim() || data?.email || null;
  }

  async listOwnerUserIds() {
    const { data, error } = await this.supabase.admin
      .from('workspace_users')
      .select('user_id')
      .eq('role', 'owner')
      .returns<Array<{ user_id: string }>>();
    if (error) throw new Error(error.message);
    return [...new Set((data ?? []).map((row) => row.user_id))];
  }

  async listUserEmails(userIds: string[]) {
    if (userIds.length === 0) return new Map<string, string>();
    const { data, error } = await this.supabase.admin
      .from('users')
      .select('id, email')
      .in('id', userIds)
      .returns<Array<{ id: string; email: string }>>();
    if (error) throw new Error(error.message);
    return new Map((data ?? []).map((row) => [row.id, row.email]));
  }
}
