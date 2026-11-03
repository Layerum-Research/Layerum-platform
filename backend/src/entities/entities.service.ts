import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateEntityDto } from './dto/create-entity.dto';
import { AuditService } from '../audit/audit.service';
import { VectorService } from '../vector/vector.service';
import { StorageService } from '../storage/storage.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class EntitiesService {
  private readonly logger = new Logger(EntitiesService.name);

  constructor(
    private supabase: SupabaseService,
    private readonly audit: AuditService,
    private readonly vector: VectorService,
    private readonly storage: StorageService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async create(workspaceId: string, userId: string, dto: CreateEntityDto) {
    const { data, error } = await this.supabase.admin
      .from('entities')
      .insert({ ...dto, workspace_id: workspaceId, created_by: userId })
      .select('*, entity_type:entity_types(id, name, label)')
      .single();

    if (error) throw new Error(error.message);

    try {
      await this.subscriptions.assertWorkspaceWithinCapacity(workspaceId);
    } catch (capacityError) {
      const { error: rollbackError } = await this.supabase.admin
        .from('entities')
        .delete()
        .eq('id', data.id)
        .eq('workspace_id', workspaceId);

      if (rollbackError) {
        this.logger.error(
          `Failed to rollback entity ${data.id} after capacity check: ${rollbackError.message}`,
        );
      }
      throw capacityError;
    }

    await this.safeAudit({
      workspaceId,
      userId,
      action: 'create',
      resource: 'entity',
      resourceId: data.id,
      metadata: { name: dto.name, parentId: dto.parent_id ?? null },
    });
    return data;
  }

  async findAll(workspaceId: string, parentId?: string) {
    let query = this.supabase.admin
      .from('entities')
      .select('*, entity_type:entity_types(id, name, label)')
      .eq('workspace_id', workspaceId)
      .order('name');

    if (parentId) {
      query = query.eq('parent_id', parentId);
    } else {
      query = query.is('parent_id', null);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }

  async findTree(workspaceId: string) {
    const { data, error } = await this.supabase.admin
      .from('entities')
      .select('*, entity_type:entity_types(id, name, label)')
      .eq('workspace_id', workspaceId)
      .order('depth')
      .order('name');

    if (error) throw new Error(error.message);
    return this.buildTree(data ?? []);
  }

  private buildTree(flat: Record<string, unknown>[]) {
    const map = new Map<string, Record<string, unknown>>();
    const roots: Record<string, unknown>[] = [];

    for (const node of flat) {
      map.set(node.id as string, { ...node, children: [] });
    }

    for (const node of map.values()) {
      if (node.parent_id) {
        const parent = map.get(node.parent_id as string);
        if (parent) (parent.children as Record<string, unknown>[]).push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async findOne(workspaceId: string, id: string) {
    const { data, error } = await this.supabase.admin
      .from('entities')
      .select('*, entity_type:entity_types(id, name, label)')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !data) throw new NotFoundException('Entity not found');
    return data;
  }

  async update(
    workspaceId: string,
    id: string,
    userId: string,
    dto: Partial<CreateEntityDto>,
  ) {
    const { data, error } = await this.supabase.admin
      .from('entities')
      .update(dto)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('*, entity_type:entity_types(id, name, label)')
      .single();

    if (error) throw new Error(error.message);
    await this.safeAudit({
      workspaceId,
      userId,
      action: 'update',
      resource: 'entity',
      resourceId: id,
      metadata: { fields: Object.keys(dto) },
    });
    return data;
  }

  async remove(workspaceId: string, id: string, userId: string) {
    let currentStep = 'resolve_entity_scope';

    try {
      this.logger.log(
        JSON.stringify({
          event: 'entity_delete_started',
          workspaceId,
          entityId: id,
        }),
      );

      const scopedEntityIds = await this.resolveCascadeEntityIds(
        workspaceId,
        id,
      );

      currentStep = 'load_vector_records';
      const { data: vectorRows, error: vectorError } = await this.supabase.admin
        .from('vector_records')
        .select('collection_name, vector_point_id')
        .eq('workspace_id', workspaceId)
        .in('entity_id', scopedEntityIds);
      if (vectorError) throw new Error(vectorError.message);

      currentStep = 'qdrant_cleanup';
      const pointsByCollection = new Map<string, string[]>();
      for (const row of vectorRows ?? []) {
        const collectionName = (row as { collection_name?: string | null })
          .collection_name;
        const pointId = (row as { vector_point_id?: string | null })
          .vector_point_id;
        if (!collectionName || !pointId) continue;
        if (!pointsByCollection.has(collectionName)) {
          pointsByCollection.set(collectionName, []);
        }
        pointsByCollection.get(collectionName)!.push(pointId);
      }

      for (const [collectionName, pointIds] of pointsByCollection) {
        for (let i = 0; i < pointIds.length; i += 256) {
          await this.vector.deletePoints(
            collectionName,
            pointIds.slice(i, i + 256),
          );
        }
      }

      this.logger.log(
        JSON.stringify({
          event: 'entity_delete_qdrant_done',
          workspaceId,
          entityId: id,
          entityCount: scopedEntityIds.length,
          vectorRecordCount: vectorRows?.length ?? 0,
          collectionCount: pointsByCollection.size,
        }),
      );

      currentStep = 'load_s3_objects';
      const { data: sourceRows, error: sourceError } = await this.supabase.admin
        .from('data_sources')
        .select('storage_path')
        .eq('workspace_id', workspaceId)
        .in('entity_id', scopedEntityIds)
        .eq('storage_backend', 's3')
        .not('storage_path', 'is', null);
      if (sourceError) throw new Error(sourceError.message);

      const storagePaths = Array.from(
        new Set(
          (sourceRows ?? [])
            .map(
              (row) => (row as { storage_path?: string | null }).storage_path,
            )
            .filter((value): value is string => Boolean(value && value.trim())),
        ),
      );

      currentStep = 's3_cleanup';
      await this.storage.deleteObjects(storagePaths);
      this.logger.log(
        JSON.stringify({
          event: 'entity_delete_s3_done',
          workspaceId,
          entityId: id,
          objectCount: storagePaths.length,
        }),
      );

      currentStep = 'delete_entity';
      const { error: deleteError } = await this.supabase.admin
        .from('entities')
        .delete()
        .eq('id', id)
        .eq('workspace_id', workspaceId);
      if (deleteError) throw new Error(deleteError.message);

      await this.safeAudit({
        workspaceId,
        userId,
        action: 'delete',
        resource: 'entity',
        resourceId: id,
        metadata: { removedEntityCount: scopedEntityIds.length },
      });

      this.logger.log(
        JSON.stringify({
          event: 'entity_delete_completed',
          workspaceId,
          entityId: id,
          entityCount: scopedEntityIds.length,
        }),
      );

      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Entity delete failed';

      await this.safeAudit({
        workspaceId,
        userId,
        action: 'delete',
        resource: 'entity',
        resourceId: id,
        success: false,
        errorCode: this.errorCode(error),
        metadata: { failed_step: currentStep },
      });

      this.logger.error(
        JSON.stringify({
          event: 'entity_delete_failed',
          workspaceId,
          entityId: id,
          failed_step: currentStep,
          error: message,
        }),
      );

      if (error instanceof NotFoundException) {
        throw error;
      }

      if (
        currentStep !== 'delete_entity' &&
        currentStep !== 'resolve_entity_scope'
      ) {
        throw new Error(
          `Entity delete aborted: external cleanup failed at ${currentStep}`,
        );
      }
      throw error;
    }
  }

  private async resolveCascadeEntityIds(
    workspaceId: string,
    rootEntityId: string,
  ) {
    const { data: rows, error } = await this.supabase.admin
      .from('entities')
      .select('id, parent_id')
      .eq('workspace_id', workspaceId);

    if (error) throw new Error(error.message);
    const entities = (rows ?? []) as Array<{
      id: string;
      parent_id: string | null;
    }>;
    const byParent = new Map<string | null, string[]>();
    for (const row of entities) {
      const parent = row.parent_id ?? null;
      const current = byParent.get(parent) ?? [];
      current.push(row.id);
      byParent.set(parent, current);
    }

    const exists = entities.some((row) => row.id === rootEntityId);
    if (!exists) throw new NotFoundException('Entity not found');

    const ids: string[] = [];
    const queue = [rootEntityId];
    const seen = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (seen.has(current)) continue;
      seen.add(current);
      ids.push(current);

      const children = byParent.get(current) ?? [];
      for (const childId of children) queue.push(childId);
    }

    return ids;
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
