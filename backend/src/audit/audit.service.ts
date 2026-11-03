import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuditService {
  constructor(private supabase: SupabaseService) {}

  async log(data: {
    workspaceId?: string;
    userId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.supabase.admin.from('audit_logs').insert({
      workspace_id: data.workspaceId ?? null,
      user_id: data.userId ?? null,
      action: data.action,
      resource: data.resource,
      resource_id: data.resourceId ?? null,
      ip_address: data.ipAddress ?? null,
      user_agent: data.userAgent ?? null,
      metadata: data.metadata ?? {},
    });
  }

  async getLogs(workspaceId: string, limit = 100) {
    const { data } = await this.supabase.admin
      .from('audit_logs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data ?? [];
  }

  async logAction(data: {
    workspaceId?: string;
    userId?: string;
    action: 'create' | 'update' | 'delete' | 'read' | 'login' | 'logout' | 'key_rotation' | 'query' | 'upload';
    resource: string;
    resourceId?: string;
    success?: boolean;
    errorCode?: string;
    metadata?: Record<string, unknown>;
  }) {
    const metadata: Record<string, unknown> = {
      success: data.success ?? true,
      ...(data.errorCode ? { errorCode: data.errorCode } : {}),
      ...(data.metadata ?? {}),
    };
    await this.log({
      workspaceId: data.workspaceId,
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
      metadata,
    });
  }
}
