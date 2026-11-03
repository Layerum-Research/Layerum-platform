import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateModelConfigDto } from './dto/create-model-config.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ModelConfigsService {
  constructor(
    private supabase: SupabaseService,
    private readonly audit: AuditService,
  ) {}

  async create(workspaceId: string, userId: string, dto: CreateModelConfigDto) {
    try {
      const { llmConnectionId, embeddingConnectionId } =
        this.resolveConnectionIds(dto);
      await this.assertProviderConsistency({
        workspaceId,
        llmModelId: dto.llm_model_id,
        embeddingModelId: dto.embedding_model_id,
        llmConnectionId,
        embeddingConnectionId,
      });

      const baseSettings = this.normalizeRetrievalSettings(null);
      const { payload: createPayload, retrievalSettings } =
        this.preparePayloadWithSettings(dto, baseSettings, true);

      const { data, error } = await this.supabase.admin
        .from('model_configs')
        .insert({
          ...createPayload,
          retrieval_settings: retrievalSettings,
          llm_provider_connection_id: llmConnectionId,
          embedding_provider_connection_id: embeddingConnectionId,
          provider_connection_id: dto.provider_connection_id ?? llmConnectionId,
          workspace_id: workspaceId,
          created_by: userId,
        })
        .select(
          '*, llm:model_definitions!llm_model_id(id, provider, provider_key, display_name), embedding:model_definitions!embedding_model_id(id, provider, provider_key, display_name)',
        )
        .single();

      if (error) throw new Error(error.message);
      await this.safeAudit({
        workspaceId,
        userId,
        action: 'create',
        resource: 'model_config',
        resourceId: data.id,
        metadata: { name: dto.name },
      });
      return this.hydrateConfigFields(data);
    } catch (error) {
      await this.safeAudit({
        workspaceId,
        userId,
        action: 'create',
        resource: 'model_config',
        success: false,
        errorCode: this.errorCode(error),
        metadata: { name: dto.name },
      });
      throw error;
    }
  }

  async findAll(workspaceId: string) {
    const { data, error } = await this.supabase.admin
      .from('model_configs')
      .select(
        '*, llm:model_definitions!llm_model_id(id, provider, display_name, is_active, capabilities), embedding:model_definitions!embedding_model_id(id, provider, display_name, is_active)',
      )
      .eq('workspace_id', workspaceId)
      .order('created_at');

    if (error) throw new Error(error.message);
    return (data ?? []).map((item) => this.hydrateConfigFields(item));
  }

  async findOne(workspaceId: string, id: string) {
    const { data, error } = await this.supabase.admin
      .from('model_configs')
      .select(
        '*, llm:model_definitions!llm_model_id(*), embedding:model_definitions!embedding_model_id(*)',
      )
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !data) throw new NotFoundException('Model config not found');
    return this.hydrateConfigFields(data);
  }

  async findOneInWorkspace(workspaceId: string, id: string) {
    return this.findOne(workspaceId, id);
  }

  async update(
    workspaceId: string,
    id: string,
    userId: string,
    dto: Partial<CreateModelConfigDto>,
  ) {
    const { data: current, error: currentError } = await this.supabase.admin
      .from('model_configs')
      .select(
        'llm_model_id, embedding_model_id, provider_connection_id, llm_provider_connection_id, embedding_provider_connection_id, retrieval_settings',
      )
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .maybeSingle<{
        llm_model_id: string;
        embedding_model_id: string;
        provider_connection_id: string | null;
        llm_provider_connection_id: string | null;
        embedding_provider_connection_id: string | null;
        retrieval_settings?: Record<string, unknown> | null;
      }>();
    if (currentError || !current)
      throw new NotFoundException('Model config not found');

    const llmConnectionId =
      dto.llm_provider_connection_id ??
      dto.provider_connection_id ??
      current.llm_provider_connection_id ??
      current.provider_connection_id;
    const embeddingConnectionId =
      dto.embedding_provider_connection_id ??
      dto.provider_connection_id ??
      current.embedding_provider_connection_id ??
      current.provider_connection_id;

    if (!llmConnectionId || !embeddingConnectionId) {
      throw new BadRequestException(
        'Both llm_provider_connection_id and embedding_provider_connection_id are required',
      );
    }

    await this.assertProviderConsistency({
      workspaceId,
      llmModelId: dto.llm_model_id ?? current.llm_model_id,
      embeddingModelId: dto.embedding_model_id ?? current.embedding_model_id,
      llmConnectionId,
      embeddingConnectionId,
    });

    const {
      payload: updatePayload,
      retrievalSettings,
      touched,
    } = this.preparePayloadWithSettings(
      dto,
      this.normalizeRetrievalSettings(current.retrieval_settings),
      false,
    );

    const payload: Record<string, unknown> = {
      ...updatePayload,
      llm_provider_connection_id: llmConnectionId,
      embedding_provider_connection_id: embeddingConnectionId,
      provider_connection_id:
        dto.provider_connection_id ??
        current.provider_connection_id ??
        llmConnectionId,
    };
    if (touched) {
      payload.retrieval_settings = retrievalSettings;
    }

    const { data, error } = await this.supabase.admin
      .from('model_configs')
      .update(payload)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('Model config not found');
    await this.safeAudit({
      workspaceId,
      userId,
      action: 'update',
      resource: 'model_config',
      resourceId: id,
      metadata: { fields: Object.keys(dto) },
    });
    return this.hydrateConfigFields(data);
  }

  async remove(workspaceId: string, id: string, userId: string) {
    await this.supabase.admin
      .from('model_configs')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);
    await this.safeAudit({
      workspaceId,
      userId,
      action: 'delete',
      resource: 'model_config',
      resourceId: id,
    });
    return { success: true };
  }

  private resolveConnectionIds(dto: CreateModelConfigDto) {
    const llmConnectionId =
      dto.llm_provider_connection_id ?? dto.provider_connection_id ?? null;
    const embeddingConnectionId =
      dto.embedding_provider_connection_id ??
      dto.provider_connection_id ??
      null;
    if (!llmConnectionId || !embeddingConnectionId) {
      throw new BadRequestException(
        'Both llm_provider_connection_id and embedding_provider_connection_id are required',
      );
    }
    return { llmConnectionId, embeddingConnectionId };
  }

  private preparePayloadWithSettings(
    dto: Partial<CreateModelConfigDto>,
    baseSettings: Record<string, unknown>,
    isCreate: boolean,
  ) {
    const payload: Record<string, unknown> = { ...dto };
    delete payload.embedding_doc_prefix;
    delete payload.embedding_query_prefix;
    delete payload.chunk_strategy;

    const nextSettings = { ...baseSettings };
    let touched = false;

    if (Object.prototype.hasOwnProperty.call(dto, 'embedding_doc_prefix')) {
      touched = true;
      this.writePrefix(
        nextSettings,
        'embedding_doc_prefix',
        dto.embedding_doc_prefix,
      );
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'embedding_query_prefix')) {
      touched = true;
      this.writePrefix(
        nextSettings,
        'embedding_query_prefix',
        dto.embedding_query_prefix,
      );
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'chunk_strategy')) {
      touched = true;
      this.writeChunkStrategy(nextSettings, dto.chunk_strategy);
    }

    return {
      payload,
      retrievalSettings: nextSettings,
      touched: isCreate ? true : touched,
    };
  }

  private writePrefix(
    settings: Record<string, unknown>,
    key: 'embedding_doc_prefix' | 'embedding_query_prefix',
    value: unknown,
  ) {
    if (typeof value !== 'string') {
      delete settings[key];
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      delete settings[key];
      return;
    }
    settings[key] = trimmed;
  }

  private writeChunkStrategy(
    settings: Record<string, unknown>,
    value: unknown,
  ) {
    if (value !== 'fixed' && value !== 'sliding' && value !== 'semantic') {
      delete settings.chunk_strategy;
      return;
    }
    settings.chunk_strategy = value;
  }

  private normalizeRetrievalSettings(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return { ...(value as Record<string, unknown>) };
  }

  private hydrateConfigFields<T extends Record<string, unknown>>(row: T) {
    const settings = this.normalizeRetrievalSettings(row.retrieval_settings);
    return {
      ...row,
      embedding_doc_prefix:
        this.readPrefix(settings, 'embedding_doc_prefix') ?? null,
      embedding_query_prefix:
        this.readPrefix(settings, 'embedding_query_prefix') ?? null,
      chunk_strategy: this.readChunkStrategy(settings) ?? null,
    };
  }

  private readPrefix(
    settings: Record<string, unknown>,
    key: 'embedding_doc_prefix' | 'embedding_query_prefix',
  ) {
    const raw = settings[key];
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private readChunkStrategy(settings: Record<string, unknown>) {
    const raw = settings.chunk_strategy;
    if (raw === 'fixed' || raw === 'sliding' || raw === 'semantic') {
      return raw;
    }
    return null;
  }

  private async assertProviderConsistency(input: {
    workspaceId: string;
    llmModelId: string;
    embeddingModelId: string;
    llmConnectionId: string;
    embeddingConnectionId: string;
  }) {
    const { data: modelDefs, error: defsError } = await this.supabase.admin
      .from('model_definitions')
      .select('id, provider')
      .in('id', [input.llmModelId, input.embeddingModelId])
      .returns<Array<{ id: string; provider: string }>>();
    if (defsError) throw new Error(defsError.message);
    const llmDef = (modelDefs ?? []).find(
      (item) => item.id === input.llmModelId,
    );
    const embeddingDef = (modelDefs ?? []).find(
      (item) => item.id === input.embeddingModelId,
    );
    if (!llmDef || !embeddingDef) {
      throw new BadRequestException('Model definition not found');
    }

    const { data: conns, error: connError } = await this.supabase.admin
      .from('provider_connections')
      .select('id, provider, workspace_id')
      .in('id', [input.llmConnectionId, input.embeddingConnectionId])
      .returns<Array<{ id: string; provider: string; workspace_id: string }>>();
    if (connError) throw new Error(connError.message);

    const llmConn = (conns ?? []).find(
      (item) => item.id === input.llmConnectionId,
    );
    const embeddingConn = (conns ?? []).find(
      (item) => item.id === input.embeddingConnectionId,
    );

    if (!llmConn || !embeddingConn) {
      throw new BadRequestException('Provider connection not found');
    }
    if (
      llmConn.workspace_id !== input.workspaceId ||
      embeddingConn.workspace_id !== input.workspaceId
    ) {
      throw new BadRequestException(
        'Provider connection is not in this workspace',
      );
    }
    if (llmConn.provider !== llmDef.provider) {
      throw new BadRequestException(
        `LLM provider mismatch: model=${llmDef.provider}, connection=${llmConn.provider}`,
      );
    }
    if (embeddingConn.provider !== embeddingDef.provider) {
      throw new BadRequestException(
        `Embedding provider mismatch: model=${embeddingDef.provider}, connection=${embeddingConn.provider}`,
      );
    }
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
