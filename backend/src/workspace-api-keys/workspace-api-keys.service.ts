import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditService } from '../audit/audit.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { ApiKeyLifecycleEvent } from '../notifications/domain/notification.types';
import type { CreateWorkspaceApiKeyDto } from './dto/create-workspace-api-key.dto';
import type { UpdateWorkspaceApiKeyDto } from './dto/update-workspace-api-key.dto';
import type {
  ApiKeyCapability,
  ApiKeyPrincipal,
} from '../common/interfaces/api-key-principal.interface';

const TOKEN_USAGE_WARNING_RATIO = 0.8;

type WorkspaceEntityScopeRow = {
  id: string;
  path: string[] | null;
};

@Injectable()
export class WorkspaceApiKeysService {
  private readonly logger = new Logger(WorkspaceApiKeysService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly audit: AuditService,
    private readonly workspaces: WorkspacesService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateWorkspaceApiKeyDto,
  ) {
    await this.assertAdminAccess(workspaceId, userId);
    await this.assertScopesBelongToWorkspace(
      workspaceId,
      dto.allowed_entity_ids,
      dto.allowed_model_config_ids,
    );

    const rawKey = this.generateRawKey();
    const { prefix, last4, hash } = this.prepareKeyFields(rawKey);

    const { data, error } = await this.supabase.admin
      .from('workspace_api_keys')
      .insert({
        workspace_id: workspaceId,
        name: dto.name,
        capabilities: dto.capabilities ?? ['query:read'],
        key_prefix: prefix,
        key_hash: hash,
        last4,
        allowed_entity_ids: dto.allowed_entity_ids,
        allowed_model_config_ids: dto.allowed_model_config_ids,
        rpm_limit: dto.rpm_limit ?? null,
        daily_token_limit: dto.daily_token_limit ?? null,
        is_active: true,
        expires_at: dto.expires_at ?? null,
        created_by: userId,
      })
      .select(
        'id, workspace_id, name, capabilities, key_prefix, last4, allowed_entity_ids, allowed_model_config_ids, rpm_limit, daily_token_limit, is_active, expires_at, revoked_at, last_used_at, created_at, updated_at',
      )
      .single();

    if (error) throw new Error(error.message);

    await this.audit.log({
      workspaceId,
      userId,
      action: 'create',
      resource: 'workspace_api_key',
      resourceId: data.id,
      metadata: { name: data.name },
    });
    await this.notifyLifecycle('api_key_created', workspaceId, userId, data);

    return {
      ...data,
      secret: rawKey,
    };
  }

  async list(workspaceId: string, userId: string) {
    await this.assertAdminAccess(workspaceId, userId);

    const { data, error } = await this.supabase.admin
      .from('workspace_api_keys')
      .select(
        'id, workspace_id, name, capabilities, key_prefix, last4, allowed_entity_ids, allowed_model_config_ids, rpm_limit, daily_token_limit, is_active, expires_at, revoked_at, last_used_at, created_at, updated_at',
      )
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async update(
    workspaceId: string,
    id: string,
    userId: string,
    dto: UpdateWorkspaceApiKeyDto,
  ) {
    await this.assertAdminAccess(workspaceId, userId);

    if (dto.allowed_entity_ids || dto.allowed_model_config_ids) {
      const current = await this.getById(workspaceId, id);
      await this.assertScopesBelongToWorkspace(
        workspaceId,
        dto.allowed_entity_ids ?? current.allowed_entity_ids,
        dto.allowed_model_config_ids ?? current.allowed_model_config_ids,
      );
    }

    const payload: Record<string, unknown> = {
      ...dto,
    };

    const { data, error } = await this.supabase.admin
      .from('workspace_api_keys')
      .update(payload)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .is('revoked_at', null)
      .select(
        'id, workspace_id, name, capabilities, key_prefix, last4, allowed_entity_ids, allowed_model_config_ids, rpm_limit, daily_token_limit, is_active, expires_at, revoked_at, last_used_at, created_at, updated_at',
      )
      .single();

    if (error || !data) throw new NotFoundException('API key not found');

    await this.audit.log({
      workspaceId,
      userId,
      action: 'update',
      resource: 'workspace_api_key',
      resourceId: data.id,
      metadata: { fields: Object.keys(dto) },
    });

    return data;
  }

  async revoke(workspaceId: string, id: string, userId: string) {
    await this.assertAdminAccess(workspaceId, userId);

    const { data, error } = await this.supabase.admin
      .from('workspace_api_keys')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .is('revoked_at', null)
      .select('id, name')
      .single();

    if (error || !data) throw new NotFoundException('API key not found');

    await this.audit.log({
      workspaceId,
      userId,
      action: 'key_rotation',
      resource: 'workspace_api_key',
      resourceId: id,
      metadata: { type: 'revoke' },
    });
    await this.notifyLifecycle('api_key_revoked', workspaceId, userId, data);

    return { success: true };
  }

  async rotate(workspaceId: string, id: string, userId: string) {
    await this.assertAdminAccess(workspaceId, userId);

    const rawKey = this.generateRawKey();
    const { prefix, last4, hash } = this.prepareKeyFields(rawKey);

    const { data, error } = await this.supabase.admin
      .from('workspace_api_keys')
      .update({
        key_prefix: prefix,
        key_hash: hash,
        last4,
        is_active: true,
        revoked_at: null,
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select(
        'id, workspace_id, name, capabilities, key_prefix, last4, allowed_entity_ids, allowed_model_config_ids, rpm_limit, daily_token_limit, is_active, expires_at, revoked_at, last_used_at, created_at, updated_at',
      )
      .single();

    if (error || !data) throw new NotFoundException('API key not found');

    await this.audit.log({
      workspaceId,
      userId,
      action: 'key_rotation',
      resource: 'workspace_api_key',
      resourceId: id,
      metadata: { type: 'rotate' },
    });
    await this.notifyLifecycle('api_key_rotated', workspaceId, userId, data);

    return {
      ...data,
      secret: rawKey,
    };
  }

  private notifyLifecycle(
    type: ApiKeyLifecycleEvent['type'],
    workspaceId: string,
    actorUserId: string,
    key: { id: string; name: string },
  ) {
    return this.notifications.notify({
      type,
      workspaceId,
      actorUserId,
      keyId: key.id,
      keyName: key.name,
    });
  }

  async authenticate(rawKey: string): Promise<ApiKeyPrincipal> {
    const prefix = this.getPrefix(rawKey);

    const { data: records, error } = await this.supabase.admin
      .from('workspace_api_keys')
      .select(
        'id, workspace_id, name, capabilities, key_hash, is_active, expires_at, revoked_at, allowed_entity_ids, allowed_model_config_ids, rpm_limit, daily_token_limit',
      )
      .eq('key_prefix', prefix)
      .limit(5);

    if (error) throw new UnauthorizedException('Invalid API key');
    if (!records || records.length === 0) {
      throw new UnauthorizedException('Invalid API key');
    }

    const computed = this.hashKey(rawKey);
    const record = records.find((item) =>
      this.constantTimeEquals(item.key_hash, computed),
    );

    if (!record) throw new UnauthorizedException('Invalid API key');
    if (!record.is_active || record.revoked_at) {
      throw new UnauthorizedException('API key is inactive');
    }
    if (
      record.expires_at &&
      new Date(record.expires_at).getTime() < Date.now()
    ) {
      throw new UnauthorizedException('API key has expired');
    }

    await this.supabase.admin
      .from('workspace_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', record.id);

    return {
      id: record.id,
      workspaceId: record.workspace_id,
      name: record.name,
      capabilities: record.capabilities ?? ['query:read'],
      allowedEntityIds: record.allowed_entity_ids ?? [],
      allowedModelConfigIds: record.allowed_model_config_ids ?? [],
      rpmLimit: record.rpm_limit ?? null,
      dailyTokenLimit: record.daily_token_limit ?? null,
    };
  }

  assertCapability(principal: ApiKeyPrincipal, capability: ApiKeyCapability) {
    if (!principal.capabilities.includes(capability)) {
      throw new ForbiddenException(
        `API key lacks required capability: ${capability}`,
      );
    }
  }

  assertAnyCapability(
    principal: ApiKeyPrincipal,
    capabilities: ApiKeyCapability[],
  ) {
    if (
      capabilities.some((capability) =>
        principal.capabilities.includes(capability),
      )
    ) {
      return;
    }
    throw new ForbiddenException(
      `API key lacks required capability: one of [${capabilities.join(', ')}]`,
    );
  }

  async assertPublicQueryAllowed(
    principal: ApiKeyPrincipal,
    input: {
      workspaceId: string;
      entityId: string;
      modelConfigId: string;
    },
  ) {
    if (principal.workspaceId !== input.workspaceId) {
      throw new ForbiddenException('API key is not allowed for this workspace');
    }
    await this.assertEntityAllowed(principal, input.entityId);
    this.assertModelConfigAllowed(principal, input.modelConfigId);
  }

  async assertEntityAllowed(principal: ApiKeyPrincipal, entityId: string) {
    const scoped = await this.expandAllowedEntityIds(principal);
    if (!scoped.has(entityId)) {
      throw new ForbiddenException('Entity is not allowed for this API key');
    }
  }

  assertModelConfigAllowed(principal: ApiKeyPrincipal, modelConfigId: string) {
    if (!principal.allowedModelConfigIds.includes(modelConfigId)) {
      throw new ForbiddenException(
        'Model config is not allowed for this API key',
      );
    }
  }

  async appendAllowedModelConfigId(
    principal: ApiKeyPrincipal,
    modelConfigId: string,
  ) {
    const next = [
      ...new Set([...(principal.allowedModelConfigIds ?? []), modelConfigId]),
    ];
    const { error } = await this.supabase.admin
      .from('workspace_api_keys')
      .update({ allowed_model_config_ids: next })
      .eq('id', principal.id)
      .eq('workspace_id', principal.workspaceId)
      .is('revoked_at', null);

    if (error) throw new Error(error.message);
  }

  async expandAllowedEntityIds(principal: ApiKeyPrincipal) {
    const allowedRoots = [...new Set(principal.allowedEntityIds)];
    if (allowedRoots.length === 0) {
      return new Set<string>();
    }

    const { data, error } = await this.supabase.admin
      .from('entities')
      .select('id, path')
      .eq('workspace_id', principal.workspaceId)
      .returns<WorkspaceEntityScopeRow[]>();

    if (error) throw new Error(error.message);

    const roots = new Set(allowedRoots);
    const scoped = new Set<string>();

    for (const row of data ?? []) {
      const path = row.path ?? [];
      if (path.some((segment) => roots.has(segment))) {
        scoped.add(row.id);
      }
    }

    return scoped;
  }

  async resolveActorUserId(principal: ApiKeyPrincipal) {
    const { data: keyRow, error: keyError } = await this.supabase.admin
      .from('workspace_api_keys')
      .select('created_by')
      .eq('id', principal.id)
      .eq('workspace_id', principal.workspaceId)
      .maybeSingle<{ created_by: string | null }>();

    if (keyError) throw new Error(keyError.message);
    if (keyRow?.created_by) return keyRow.created_by;

    const { data: workspace, error: workspaceError } = await this.supabase.admin
      .from('workspaces')
      .select('created_by')
      .eq('id', principal.workspaceId)
      .maybeSingle<{ created_by: string | null }>();

    if (workspaceError) throw new Error(workspaceError.message);
    if (!workspace?.created_by) {
      throw new UnauthorizedException('Cannot resolve actor for API key');
    }

    return workspace.created_by;
  }

  async assertRateLimits(principal: ApiKeyPrincipal) {
    if (principal.dailyTokenLimit) {
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);

      const { data, error } = await this.supabase.admin
        .from('query_logs')
        .select('total_tokens')
        .eq('workspace_id', principal.workspaceId)
        .contains('metadata', { api_key_id: principal.id })
        .gte('created_at', start.toISOString())
        .limit(5000);

      if (error) throw new Error(error.message);

      const used = (data ?? []).reduce(
        (sum, item) => sum + Number(item.total_tokens ?? 0),
        0,
      );
      if (used >= principal.dailyTokenLimit * TOKEN_USAGE_WARNING_RATIO) {
        await this.warnTokenUsageOncePerDay(principal, used, start);
      }
      if (used >= principal.dailyTokenLimit) {
        throw new BadRequestException('daily_token_limit_exceeded');
      }
    }
  }

  private async warnTokenUsageOncePerDay(
    principal: ApiKeyPrincipal,
    usedTokens: number,
    dayStart: Date,
  ) {
    if (!principal.dailyTokenLimit) return;
    const today = dayStart.toISOString().slice(0, 10);

    // The conditional update is the once-per-day guard: only the first request
    // that sees the threshold crossed today gets a row back.
    const { data, error } = await this.supabase.admin
      .from('workspace_api_keys')
      .update({ token_usage_alerted_on: today })
      .eq('id', principal.id)
      .or(`token_usage_alerted_on.is.null,token_usage_alerted_on.lt.${today}`)
      .select('id');

    if (error) {
      this.logger.warn(
        `Failed to record token usage alert for API key ${principal.id}: ${error.message}`,
      );
      return;
    }
    if (!data || data.length === 0) return;

    await this.notifications.notify({
      type: 'api_key_token_usage_warning',
      workspaceId: principal.workspaceId,
      keyId: principal.id,
      keyName: principal.name,
      usedTokens,
      limitTokens: principal.dailyTokenLimit,
    });
  }

  private async getById(workspaceId: string, id: string) {
    const { data, error } = await this.supabase.admin
      .from('workspace_api_keys')
      .select('id, allowed_entity_ids, allowed_model_config_ids')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !data) throw new NotFoundException('API key not found');
    return data;
  }

  private async assertAdminAccess(workspaceId: string, userId: string) {
    const member = await this.workspaces.assertMembership(workspaceId, userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      throw new ForbiddenException('Only owner/admin can manage API keys');
    }
  }

  private async assertScopesBelongToWorkspace(
    workspaceId: string,
    entityIds: string[],
    modelConfigIds: string[],
  ) {
    const uniqEntities = [...new Set(entityIds)];
    const uniqModels = [...new Set(modelConfigIds)];

    if (uniqEntities.length === 0 || uniqModels.length === 0) {
      throw new BadRequestException(
        'allowed_entity_ids and allowed_model_config_ids are required',
      );
    }

    const { data: entities, error: entitiesError } = await this.supabase.admin
      .from('entities')
      .select('id')
      .eq('workspace_id', workspaceId)
      .in('id', uniqEntities);

    if (entitiesError) throw new Error(entitiesError.message);
    if ((entities ?? []).length !== uniqEntities.length) {
      throw new BadRequestException(
        'Some allowed_entity_ids are invalid for this workspace',
      );
    }

    const { data: modelConfigs, error: modelConfigsError } =
      await this.supabase.admin
        .from('model_configs')
        .select('id')
        .eq('workspace_id', workspaceId)
        .in('id', uniqModels);

    if (modelConfigsError) throw new Error(modelConfigsError.message);
    if ((modelConfigs ?? []).length !== uniqModels.length) {
      throw new BadRequestException(
        'Some allowed_model_config_ids are invalid for this workspace',
      );
    }
  }

  private generateRawKey() {
    return `lyr_wk_${randomBytes(24).toString('base64url')}`;
  }

  private prepareKeyFields(rawKey: string) {
    return {
      prefix: this.getPrefix(rawKey),
      last4: rawKey.slice(-4),
      hash: this.hashKey(rawKey),
    };
  }

  private getPrefix(rawKey: string) {
    const safe = rawKey.trim();
    if (!safe.startsWith('lyr_wk_')) {
      throw new UnauthorizedException('Invalid API key');
    }
    return safe.slice(0, Math.min(18, safe.length));
  }

  private hashKey(rawKey: string) {
    const secret = (
      process.env.API_KEY_HASH_SECRET ??
      process.env.ENCRYPTION_KEY ??
      ''
    ).trim();
    if (!secret) {
      throw new Error(
        'API_KEY_HASH_SECRET or ENCRYPTION_KEY must be configured for API key hashing',
      );
    }
    return createHash('sha256').update(`${secret}:${rawKey}`).digest('hex');
  }

  private constantTimeEquals(a: string, b: string) {
    const aa = Buffer.from(a);
    const bb = Buffer.from(b);
    if (aa.length !== bb.length) return false;
    return timingSafeEqual(aa, bb);
  }
}
