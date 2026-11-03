import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateEntityTypeDto } from './dto/create-entity-type.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class EntityTypesService {
  constructor(
    private supabase: SupabaseService,
    private readonly audit: AuditService,
  ) {}

  async create(workspaceId: string, userId: string, dto: CreateEntityTypeDto) {
    const { data, error } = await this.supabase.admin
      .from('entity_types')
      .insert({ ...dto, workspace_id: workspaceId, created_by: userId })
      .select()
      .single();

    if (error) throw new Error(error.message);
    await this.safeAudit({
      workspaceId,
      userId,
      action: 'create',
      resource: 'entity_type',
      resourceId: data.id,
      metadata: { name: dto.name, label: dto.label },
    });
    return data;
  }

  async findAll(workspaceId: string) {
    const { data, error } = await this.supabase.admin
      .from('entity_types')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at');

    if (error) throw new Error(error.message);
    return data;
  }

  async findOne(workspaceId: string, id: string) {
    const { data, error } = await this.supabase.admin
      .from('entity_types')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !data) throw new NotFoundException('Entity type not found');
    return data;
  }

  async update(
    workspaceId: string,
    id: string,
    userId: string,
    dto: Partial<CreateEntityTypeDto>,
  ) {
    const { data, error } = await this.supabase.admin
      .from('entity_types')
      .update(dto)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    await this.safeAudit({
      workspaceId,
      userId,
      action: 'update',
      resource: 'entity_type',
      resourceId: id,
      metadata: { fields: Object.keys(dto) },
    });
    return data;
  }

  async remove(workspaceId: string, id: string, userId: string) {
    await this.supabase.admin
      .from('entity_types')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);
    await this.safeAudit({
      workspaceId,
      userId,
      action: 'delete',
      resource: 'entity_type',
      resourceId: id,
    });
    return { success: true };
  }

  private async safeAudit(input: Parameters<AuditService['logAction']>[0]) {
    try {
      await this.audit.logAction(input);
    } catch {}
  }
}
