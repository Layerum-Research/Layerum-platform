import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { NotificationRepository } from '../domain/ports';
import type {
  NotificationDraft,
  NotificationRecord,
} from '../domain/notification.types';

const RECORD_COLUMNS = 'id, workspace_id, type, severity, payload, created_at';

function workspaceScopeFilter(workspaceId: string | null) {
  return workspaceId
    ? `workspace_id.eq.${workspaceId},workspace_id.is.null`
    : 'workspace_id.is.null';
}

@Injectable()
export class SupabaseNotificationRepository extends NotificationRepository {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async insertMany(drafts: NotificationDraft[]) {
    const rows = drafts.map((draft) => ({
      user_id: draft.userId,
      workspace_id: draft.workspaceId,
      type: draft.type,
      severity: draft.severity,
      payload: draft.payload,
      dedupe_key: draft.dedupeKey,
    }));
    const { error } = await this.supabase.admin.rpc('insert_notifications', {
      p_rows: rows,
    });
    if (error) throw new Error(error.message);
  }

  async listUnread(userId: string, workspaceId: string | null, limit: number) {
    const { data, error } = await this.supabase.admin
      .from('notifications')
      .select(RECORD_COLUMNS)
      .eq('user_id', userId)
      .is('read_at', null)
      .or(workspaceScopeFilter(workspaceId))
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as NotificationRecord[];
  }

  async markRead(userId: string, notificationId: string) {
    const { error } = await this.supabase.admin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) throw new Error(error.message);
  }

  async markAllRead(userId: string, workspaceId: string | null) {
    const { error } = await this.supabase.admin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null)
      .or(workspaceScopeFilter(workspaceId));
    if (error) throw new Error(error.message);
  }

  async purgeReadBefore(cutoff: Date) {
    const { error } = await this.supabase.admin
      .from('notifications')
      .delete()
      .lt('read_at', cutoff.toISOString());
    if (error) throw new Error(error.message);
  }
}
