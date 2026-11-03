import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Express } from 'express';
import { WorkspaceApiKeysService } from '../workspace-api-keys/workspace-api-keys.service';
import { QueryService } from '../query/query.service';
import type { ApiKeyPrincipal } from '../common/interfaces/api-key-principal.interface';
import type { PublicQueryRequestDto } from './dto/public-query-request.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { EntitiesService } from '../entities/entities.service';
import { EntityTypesService } from '../entity-types/entity-types.service';
import { DataSourcesService } from '../data-sources/data-sources.service';
import { ModelDefinitionsService } from '../model-definitions/model-definitions.service';
import { ProviderConnectionsService } from '../provider-connections/provider-connections.service';
import { ModelConfigsService } from '../model-configs/model-configs.service';
import type { CreateEntityDto } from '../entities/dto/create-entity.dto';
import type { CreateEntityTypeDto } from '../entity-types/dto/create-entity-type.dto';
import type { CreateDataSourceDto } from '../data-sources/dto/create-data-source.dto';
import type { InitUploadDto } from '../data-sources/dto/init-upload.dto';
import type { CompleteUploadDto } from '../data-sources/dto/complete-upload.dto';
import type { CreateProviderDto } from '../provider-connections/dto/create-provider.dto';
import type { CreateModelConfigDto } from '../model-configs/dto/create-model-config.dto';

type PublicEntityRow = {
  id: string;
  name: string;
  parent_id: string | null;
  entity_type_id?: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  depth?: number;
};

type PublicEntity = {
  id: string;
  name: string;
  parentId: string | null;
  entityTypeId: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  depth: number;
};

type PublicEntityTypeRow = {
  id: string;
  workspace_id: string;
  name: string;
  label: string;
};

type PublicModelRow = {
  id: string;
  workspace_id: string;
  name: string;
  entity_id: string | null;
  llm_model_id: string;
  embedding_model_id: string;
  provider_connection_id: string | null;
  llm_provider_connection_id: string | null;
  embedding_provider_connection_id: string | null;
  system_prompt: string | null;
  embedding_doc_prefix?: string | null;
  embedding_query_prefix?: string | null;
  chunk_strategy?: 'fixed' | 'sliding' | 'semantic' | null;
  temperature: number | null;
  top_k: number | null;
  chunk_size: number | null;
  chunk_overlap: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  llm?: { id: string; provider: string; display_name: string } | null;
  embedding?: { id: string; provider: string; display_name: string } | null;
};

type PublicProviderRow = {
  id: string;
  workspace_id: string;
  entity_id: string | null;
  provider: string;
  display_name: string;
  key_preview?: string | null;
  provider_config?: Record<string, unknown> | null;
  is_active?: boolean | null;
  last_tested_at?: string | null;
  test_passed?: boolean | null;
  created_at?: string | null;
};

type PublicEntityNode = PublicEntity & {
  children: PublicEntityNode[];
};

type PublicSourceRow = {
  id: string;
  workspace_id: string;
  entity_id: string;
  source_type: string;
  display_name: string;
  status: string;
  visibility: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class PublicApiService {
  constructor(
    private readonly apiKeys: WorkspaceApiKeysService,
    private readonly queryService: QueryService,
    private readonly supabase: SupabaseService,
    private readonly entities: EntitiesService,
    private readonly entityTypes: EntityTypesService,
    private readonly dataSources: DataSourcesService,
    private readonly modelDefinitions: ModelDefinitionsService,
    private readonly providers: ProviderConnectionsService,
    private readonly modelConfigs: ModelConfigsService,
  ) {}

  async listEntities(principal: ApiKeyPrincipal) {
    this.apiKeys.assertCapability(principal, 'query:read');

    const scopedEntityIds =
      await this.apiKeys.expandAllowedEntityIds(principal);
    if (scopedEntityIds.size === 0) {
      return { items: [] };
    }

    const rows = await this.loadScopedEntities(principal.workspaceId, [
      ...scopedEntityIds,
    ]);

    return {
      items: rows.map((row) => this.toPublicEntity(row)),
    };
  }

  async listEntityTree(principal: ApiKeyPrincipal) {
    this.apiKeys.assertCapability(principal, 'query:read');

    const scopedEntityIds =
      await this.apiKeys.expandAllowedEntityIds(principal);
    if (scopedEntityIds.size === 0) {
      return { items: [] };
    }

    const rows = await this.loadScopedEntities(principal.workspaceId, [
      ...scopedEntityIds,
    ]);

    return {
      items: this.buildEntityTree(rows),
    };
  }

  async createEntity(principal: ApiKeyPrincipal, dto: CreateEntityDto) {
    this.apiKeys.assertCapability(principal, 'data:ingest');

    if (!dto.parent_id) {
      throw new ForbiddenException(
        'Root entity creation is not allowed for scoped API keys',
      );
    }

    await this.apiKeys.assertEntityAllowed(principal, dto.parent_id);
    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    const created = await this.entities.create(
      principal.workspaceId,
      actorUserId,
      dto,
    );
    return this.toPublicEntity(created as unknown as PublicEntityRow);
  }

  async deleteEntity(principal: ApiKeyPrincipal, id: string) {
    this.apiKeys.assertCapability(principal, 'data:ingest');
    await this.apiKeys.assertEntityAllowed(principal, id);

    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    return this.entities.remove(principal.workspaceId, id, actorUserId);
  }

  async listEntityTypes(principal: ApiKeyPrincipal) {
    this.apiKeys.assertCapability(principal, 'query:read');
    const rows = await this.entityTypes.findAll(principal.workspaceId);
    return {
      items: (rows ?? []).map((row) =>
        this.toPublicEntityType(row as PublicEntityTypeRow),
      ),
    };
  }

  async getEntityType(principal: ApiKeyPrincipal, id: string) {
    this.apiKeys.assertCapability(principal, 'query:read');
    const row = (await this.entityTypes.findOne(
      principal.workspaceId,
      id,
    )) as PublicEntityTypeRow;
    return this.toPublicEntityType(row);
  }

  async createEntityType(principal: ApiKeyPrincipal, dto: CreateEntityTypeDto) {
    this.apiKeys.assertCapability(principal, 'data:ingest');
    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    const created = (await this.entityTypes.create(
      principal.workspaceId,
      actorUserId,
      dto,
    )) as PublicEntityTypeRow;
    return this.toPublicEntityType(created);
  }

  async deleteEntityType(principal: ApiKeyPrincipal, id: string) {
    this.apiKeys.assertCapability(principal, 'data:ingest');
    await this.entityTypes.findOne(principal.workspaceId, id);
    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    return this.entityTypes.remove(principal.workspaceId, id, actorUserId);
  }

  async listEntityDocuments(principal: ApiKeyPrincipal, entityId: string) {
    this.apiKeys.assertCapability(principal, 'query:read');
    await this.apiKeys.assertEntityAllowed(principal, entityId);

    const rows = await this.dataSources.findAll(
      principal.workspaceId,
      entityId,
    );
    return {
      items: (rows ?? []).map((row) =>
        this.toPublicSource(row as PublicSourceRow),
      ),
    };
  }

  async listWorkspaceDocuments(principal: ApiKeyPrincipal) {
    this.apiKeys.assertCapability(principal, 'query:read');
    const scopedEntityIds =
      await this.apiKeys.expandAllowedEntityIds(principal);
    if (scopedEntityIds.size === 0) {
      return { items: [] };
    }

    const rows = await this.dataSources.findAll(principal.workspaceId);
    return {
      items: (rows ?? [])
        .filter((row) =>
          scopedEntityIds.has((row as PublicSourceRow).entity_id),
        )
        .map((row) => this.toPublicSource(row as PublicSourceRow)),
    };
  }

  async getDocument(principal: ApiKeyPrincipal, entityId: string, id: string) {
    this.apiKeys.assertCapability(principal, 'query:read');
    await this.apiKeys.assertEntityAllowed(principal, entityId);

    const row = (await this.dataSources.findOne(
      principal.workspaceId,
      entityId,
      id,
    )) as PublicSourceRow;
    return this.toPublicSource(row);
  }

  async createDocument(
    principal: ApiKeyPrincipal,
    entityId: string,
    dto: CreateDataSourceDto,
  ) {
    this.apiKeys.assertCapability(principal, 'data:ingest');
    await this.apiKeys.assertEntityAllowed(principal, entityId);
    this.assertCreateDocumentSourceType(dto.source_type);
    if (dto.model_config_id) {
      this.apiKeys.assertModelConfigAllowed(principal, dto.model_config_id);
    }

    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    const created = (await this.dataSources.create(
      principal.workspaceId,
      entityId,
      actorUserId,
      dto,
    )) as PublicSourceRow;
    return this.toPublicSource(created);
  }

  async uploadDocument(
    principal: ApiKeyPrincipal,
    entityId: string,
    file: Express.Multer.File,
    visibility: 'self' | 'self_and_descendants' = 'self_and_descendants',
    modelConfigId?: string,
  ) {
    this.apiKeys.assertCapability(principal, 'data:ingest');
    await this.apiKeys.assertEntityAllowed(principal, entityId);
    if (modelConfigId) {
      this.apiKeys.assertModelConfigAllowed(principal, modelConfigId);
    }

    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    const created = (await this.dataSources.uploadAndCreate(
      principal.workspaceId,
      entityId,
      actorUserId,
      file,
      visibility,
      modelConfigId,
    )) as PublicSourceRow;
    return this.toPublicSource(created);
  }

  async uploadDocumentInit(
    principal: ApiKeyPrincipal,
    entityId: string,
    dto: InitUploadDto,
  ) {
    this.apiKeys.assertCapability(principal, 'data:ingest');
    await this.apiKeys.assertEntityAllowed(principal, entityId);
    if (dto.model_config_id) {
      this.apiKeys.assertModelConfigAllowed(principal, dto.model_config_id);
    }

    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    return this.dataSources.initUpload(
      principal.workspaceId,
      entityId,
      actorUserId,
      dto,
    );
  }

  async uploadDocumentComplete(
    principal: ApiKeyPrincipal,
    entityId: string,
    dto: CompleteUploadDto,
  ) {
    this.apiKeys.assertCapability(principal, 'data:ingest');
    await this.apiKeys.assertEntityAllowed(principal, entityId);
    if (dto.model_config_id) {
      this.apiKeys.assertModelConfigAllowed(principal, dto.model_config_id);
    }

    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    const created = (await this.dataSources.completeUpload(
      principal.workspaceId,
      entityId,
      actorUserId,
      dto,
    )) as PublicSourceRow;
    return this.toPublicSource(created);
  }

  async deleteDocument(
    principal: ApiKeyPrincipal,
    entityId: string,
    id: string,
  ) {
    this.apiKeys.assertCapability(principal, 'data:ingest');
    await this.apiKeys.assertEntityAllowed(principal, entityId);
    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    return this.dataSources.remove(
      principal.workspaceId,
      entityId,
      id,
      actorUserId,
    );
  }

  async retryDocumentIngestion(
    principal: ApiKeyPrincipal,
    entityId: string,
    id: string,
  ) {
    this.apiKeys.assertCapability(principal, 'data:ingest');
    await this.apiKeys.assertEntityAllowed(principal, entityId);
    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    return this.dataSources.retryIngestion(
      principal.workspaceId,
      entityId,
      id,
      actorUserId,
    );
  }

  async getDocumentError(
    principal: ApiKeyPrincipal,
    entityId: string,
    id: string,
  ) {
    this.apiKeys.assertCapability(principal, 'query:read');
    await this.apiKeys.assertEntityAllowed(principal, entityId);
    return this.dataSources.getLatestError(principal.workspaceId, entityId, id);
  }

  async listModels(principal: ApiKeyPrincipal) {
    this.apiKeys.assertAnyCapability(principal, [
      'query:read',
      'config:manage',
    ]);

    const allowed = [...new Set(principal.allowedModelConfigIds)];
    if (allowed.length === 0) {
      return { items: [] };
    }

    const { data, error } = await this.supabase.admin
      .from('model_configs')
      .select(
        'id, workspace_id, name, entity_id, llm_model_id, embedding_model_id, provider_connection_id, llm_provider_connection_id, embedding_provider_connection_id, system_prompt, temperature, top_k, chunk_size, chunk_overlap, is_default, created_at, updated_at, retrieval_settings, llm:model_definitions!llm_model_id(id, provider, display_name), embedding:model_definitions!embedding_model_id(id, provider, display_name)',
      )
      .eq('workspace_id', principal.workspaceId)
      .in('id', allowed)
      .order('created_at', { ascending: true })
      .returns<
        Array<PublicModelRow & { retrieval_settings?: Record<string, unknown> }>
      >();

    if (error) throw new Error(error.message);

    return { items: (data ?? []).map((row) => this.toPublicModel(row)) };
  }

  async getModel(principal: ApiKeyPrincipal, id: string) {
    this.apiKeys.assertCapability(principal, 'config:manage');
    this.apiKeys.assertModelConfigAllowed(principal, id);
    const row = (await this.modelConfigs.findOneInWorkspace(
      principal.workspaceId,
      id,
    )) as PublicModelRow;
    return this.toPublicModel(row);
  }

  async createModel(principal: ApiKeyPrincipal, dto: CreateModelConfigDto) {
    this.apiKeys.assertCapability(principal, 'config:manage');
    await this.assertModelEntityAllowed(principal, dto.entity_id);
    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    const created = (await this.modelConfigs.create(
      principal.workspaceId,
      actorUserId,
      dto,
    )) as PublicModelRow;
    await this.apiKeys.appendAllowedModelConfigId(principal, created.id);
    return this.toPublicModel(created);
  }

  async updateModel(
    principal: ApiKeyPrincipal,
    id: string,
    dto: Partial<CreateModelConfigDto>,
  ) {
    this.apiKeys.assertCapability(principal, 'config:manage');
    this.apiKeys.assertModelConfigAllowed(principal, id);
    await this.assertModelEntityAllowed(principal, dto.entity_id);
    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    const updated = (await this.modelConfigs.update(
      principal.workspaceId,
      id,
      actorUserId,
      dto,
    )) as PublicModelRow;
    return this.toPublicModel(updated);
  }

  async deleteModel(principal: ApiKeyPrincipal, id: string) {
    this.apiKeys.assertCapability(principal, 'config:manage');
    this.apiKeys.assertModelConfigAllowed(principal, id);
    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    return this.modelConfigs.remove(principal.workspaceId, id, actorUserId);
  }

  async listProviders(principal: ApiKeyPrincipal) {
    this.apiKeys.assertCapability(principal, 'config:manage');
    const rows = (await this.providers.findAll(
      principal.workspaceId,
    )) as PublicProviderRow[];
    return { items: (rows ?? []).map((row) => this.toPublicProvider(row)) };
  }

  async getProvider(principal: ApiKeyPrincipal, id: string) {
    this.apiKeys.assertCapability(principal, 'config:manage');
    const row = (await this.providers.findOne(
      principal.workspaceId,
      id,
    )) as PublicProviderRow;
    return this.toPublicProvider(row);
  }

  async createProvider(principal: ApiKeyPrincipal, dto: CreateProviderDto) {
    this.apiKeys.assertCapability(principal, 'config:manage');
    await this.assertModelEntityAllowed(principal, dto.entity_id);
    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    const created = (await this.providers.create(
      principal.workspaceId,
      actorUserId,
      dto,
    )) as PublicProviderRow;
    return this.toPublicProvider(created);
  }

  async testProvider(principal: ApiKeyPrincipal, id: string) {
    this.apiKeys.assertCapability(principal, 'config:manage');
    await this.providers.findOne(principal.workspaceId, id);
    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    return this.providers.testConnection(
      principal.workspaceId,
      id,
      actorUserId,
    );
  }

  async deleteProvider(principal: ApiKeyPrincipal, id: string) {
    this.apiKeys.assertCapability(principal, 'config:manage');
    await this.providers.findOne(principal.workspaceId, id);
    const actorUserId = await this.apiKeys.resolveActorUserId(principal);
    return this.providers.remove(principal.workspaceId, id, actorUserId);
  }

  async listModelDefinitions(principal: ApiKeyPrincipal, type?: string) {
    this.apiKeys.assertAnyCapability(principal, [
      'query:read',
      'config:manage',
    ]);
    const items = await this.modelDefinitions.findAll(type);
    return { items: items ?? [] };
  }

  async query(principal: ApiKeyPrincipal, dto: PublicQueryRequestDto) {
    return this.runQuery(principal, dto, false);
  }

  async queryDebug(principal: ApiKeyPrincipal, dto: PublicQueryRequestDto) {
    return this.runQuery(principal, dto, true);
  }

  private async runQuery(
    principal: ApiKeyPrincipal,
    dto: PublicQueryRequestDto,
    debug: boolean,
  ) {
    this.apiKeys.assertCapability(principal, 'query:read');

    await this.apiKeys.assertPublicQueryAllowed(principal, {
      workspaceId: principal.workspaceId,
      entityId: dto.entityId,
      modelConfigId: dto.modelConfigId,
    });

    const result = await this.queryService.query(
      null,
      {
        workspaceId: principal.workspaceId,
        entityId: dto.entityId,
        modelConfigId: dto.modelConfigId,
        query: dto.query,
        topK: dto.topK,
        includeParentScopes: dto.includeParentScopes,
        debug,
      },
      { apiKeyId: principal.id },
    );

    const response = {
      answer: result.answer,
      citations: (result.citations ?? []).map((citation) => ({
        index: citation.index,
        documentTitle: citation.document_title,
        excerpt: citation.excerpt,
        matchScoreRaw: citation.matchScoreRaw,
      })),
    };

    if (!debug) return response;

    return {
      ...response,
      meta: result.meta
        ? {
            resolvedEntityIds: result.meta.resolvedEntityIds,
            topK: result.meta.topK,
            latencyMs: result.meta.latencyMs,
            tokensUsed: result.meta.tokensUsed,
          }
        : undefined,
    };
  }

  private async loadScopedEntities(workspaceId: string, ids: string[]) {
    const { data, error } = await this.supabase.admin
      .from('entities')
      .select(
        'id, name, parent_id, entity_type_id, description, metadata, depth',
      )
      .eq('workspace_id', workspaceId)
      .in('id', ids)
      .order('depth', { ascending: true })
      .order('name', { ascending: true })
      .returns<PublicEntityRow[]>();
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  private buildEntityTree(rows: PublicEntityRow[]): PublicEntityNode[] {
    const map = new Map<string, PublicEntityNode>();
    const roots: PublicEntityNode[] = [];

    for (const row of rows) {
      map.set(row.id, {
        ...this.toPublicEntity(row),
        children: [],
      });
    }

    for (const node of map.values()) {
      if (node.parentId) {
        const parent = map.get(node.parentId);
        if (parent) {
          parent.children.push(node);
          continue;
        }
      }
      roots.push(node);
    }

    return roots;
  }

  private toPublicEntity(row: PublicEntityRow): PublicEntity {
    return {
      id: row.id,
      name: row.name,
      parentId: row.parent_id ?? null,
      entityTypeId: row.entity_type_id ?? null,
      description: row.description ?? null,
      metadata: row.metadata ?? {},
      depth: row.depth ?? 0,
    };
  }

  private toPublicEntityType(row: PublicEntityTypeRow) {
    return {
      id: row.id,
      name: row.name,
      label: row.label,
    };
  }

  private toPublicSource(row: PublicSourceRow) {
    return {
      id: row.id,
      entityId: row.entity_id,
      sourceType: row.source_type,
      displayName: row.display_name,
      status: row.status,
      visibility: row.visibility,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async assertModelEntityAllowed(
    principal: ApiKeyPrincipal,
    entityId?: string | null,
  ) {
    if (!entityId) return;
    await this.apiKeys.assertEntityAllowed(principal, entityId);
  }

  private toPublicProvider(row: PublicProviderRow) {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      entityId: row.entity_id ?? null,
      provider: row.provider,
      displayName: row.display_name,
      keyPreview: row.key_preview ?? null,
      providerConfig: row.provider_config ?? {},
      isActive: row.is_active ?? true,
      lastTestedAt: row.last_tested_at ?? null,
      testPassed: row.test_passed ?? null,
      createdAt: row.created_at ?? null,
    };
  }

  private toPublicModel(
    row: PublicModelRow & { retrieval_settings?: Record<string, unknown> },
  ) {
    const retrievalSettings =
      row.retrieval_settings &&
      typeof row.retrieval_settings === 'object' &&
      !Array.isArray(row.retrieval_settings)
        ? row.retrieval_settings
        : {};

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      entityId: row.entity_id ?? null,
      name: row.name,
      llmModelId: row.llm_model_id,
      embeddingModelId: row.embedding_model_id,
      providerConnectionId: row.provider_connection_id ?? null,
      llmProviderConnectionId: row.llm_provider_connection_id ?? null,
      embeddingProviderConnectionId:
        row.embedding_provider_connection_id ?? null,
      systemPrompt: row.system_prompt ?? null,
      embeddingDocPrefix:
        row.embedding_doc_prefix ??
        this.readRetrievalSettingString(
          retrievalSettings,
          'embedding_doc_prefix',
        ),
      embeddingQueryPrefix:
        row.embedding_query_prefix ??
        this.readRetrievalSettingString(
          retrievalSettings,
          'embedding_query_prefix',
        ),
      chunkStrategy:
        row.chunk_strategy ??
        this.readRetrievalSettingString(retrievalSettings, 'chunk_strategy'),
      temperature: row.temperature ?? null,
      topK: row.top_k ?? null,
      chunkSize: row.chunk_size ?? null,
      chunkOverlap: row.chunk_overlap ?? null,
      isDefault: row.is_default,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      llm: row.llm
        ? {
            id: row.llm.id,
            provider: row.llm.provider,
            displayName: row.llm.display_name,
          }
        : null,
      embedding: row.embedding
        ? {
            id: row.embedding.id,
            provider: row.embedding.provider,
            displayName: row.embedding.display_name,
          }
        : null,
    };
  }

  private readRetrievalSettingString(
    retrievalSettings: Record<string, unknown>,
    key: string,
  ) {
    const raw = retrievalSettings[key];
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private assertCreateDocumentSourceType(sourceType: string) {
    if (!['text', 'url'].includes(sourceType)) {
      throw new BadRequestException(
        'Use /documents/upload for files. JSON create supports only text and url.',
      );
    }
  }
}
