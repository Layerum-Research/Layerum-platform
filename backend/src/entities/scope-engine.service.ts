import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface ScopeResult {
  entityIds: string[];
}

@Injectable()
export class ScopeEngineService {
  constructor(private supabase: SupabaseService) {}

  async resolveScope(
    workspaceId: string,
    entityId: string,
    includeParents = true,
  ): Promise<ScopeResult> {
    const { data: targetEntity } = await this.supabase.admin
      .from('entities')
      .select('id, path')
      .eq('id', entityId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!targetEntity) return { entityIds: [entityId] };

    const path = Array.isArray(targetEntity.path)
      ? (targetEntity.path as string[])
      : [entityId];
    if (!includeParents) {
      return { entityIds: [entityId] };
    }
    return { entityIds: Array.from(new Set(path)) };
  }
}
