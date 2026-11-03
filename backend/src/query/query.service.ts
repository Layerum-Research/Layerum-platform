import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ScopeEngineService } from '../entities/scope-engine.service';
import { ProviderConnectionsService } from '../provider-connections/provider-connections.service';
import { VectorService } from '../vector/vector.service';
import { QueryRequestDto } from './dto/query-request.dto';
import { DataEncryptionService } from '../workspace-encryption/data-encryption.service';
import { ProviderRuntimeService } from '../ai-runtime/provider-runtime.service';
import { AuditService } from '../audit/audit.service';
import { NO_TEMPERATURE_CAPABILITY } from '../model-catalog/domain/model-classifier';

type ModelDefinitionRow = {
  id: string;
  provider_key: string;
  display_name: string;
  capabilities: string[] | null;
};

type ModelConfigQueryRow = {
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
  embedding_doc_prefix: string | null;
  embedding_query_prefix: string | null;
  chunk_strategy: 'fixed' | 'sliding' | 'semantic' | null;
  temperature: number | null;
  top_k: number | null;
  chunk_size: number | null;
  chunk_overlap: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  retrieval_settings: Record<string, unknown> | null;
  llm: ModelDefinitionRow | null;
  embedding: ModelDefinitionRow | null;
};

type DocumentChunkQueryRow = {
  id: string;
  content: string;
  content_ciphertext: string | null;
  content_iv: string | null;
  content_tag: string | null;
  enc_version: number | null;
  is_encrypted: boolean | null;
  document_id: string;
  metadata: Record<string, unknown> | null;
  chunk_index: number;
};

type QueryCitation = {
  index: number;
  chunk_id: string;
  document_id: string;
  document_title: string | null;
  excerpt: string;
  matchScoreRaw?: number;
};

type QueryMeta = {
  resolvedEntityIds: string[];
  topK: number;
  latencyMs: number;
  tokensUsed?: number | null;
  rawSystemPrompt: string;
};

export type QueryResult = {
  answer: string;
  citations: QueryCitation[];
  meta?: QueryMeta;
};

@Injectable()
export class QueryService {
  constructor(
    private supabase: SupabaseService,
    private scopeEngine: ScopeEngineService,
    private providers: ProviderConnectionsService,
    private vector: VectorService,
    private encryption: DataEncryptionService,
    private runtime: ProviderRuntimeService,
    private readonly audit: AuditService,
  ) {}

  async query(
    userId: string | null,
    dto: QueryRequestDto,
    options?: { apiKeyId?: string },
  ): Promise<QueryResult> {
    const startMs = Date.now();
    try {
      const modelConfigResult = this.toTyped<{
        data: ModelConfigQueryRow | null;
      }>(
        await this.supabase.admin
          .from('model_configs')
          .select(
            '*, llm:model_definitions!llm_model_id(*), embedding:model_definitions!embedding_model_id(*)',
          )
          .eq('id', dto.modelConfigId)
          .eq('workspace_id', dto.workspaceId)
          .single(),
      );
      const modelConfig = modelConfigResult.data;

      if (!modelConfig) throw new BadRequestException('Model config not found');

      const llmProviderConnId =
        modelConfig.llm_provider_connection_id ??
        modelConfig.provider_connection_id;
      const embeddingProviderConnId =
        modelConfig.embedding_provider_connection_id ??
        modelConfig.provider_connection_id;
      if (!llmProviderConnId || !embeddingProviderConnId) {
        throw new BadRequestException(
          'Model config is missing llm/embedding provider connections',
        );
      }
      const [llmConn, embeddingConn] = await Promise.all([
        this.providers.getRuntimeConnection(dto.workspaceId, llmProviderConnId),
        this.providers.getRuntimeConnection(
          dto.workspaceId,
          embeddingProviderConnId,
        ),
      ]);

      const { entityIds } = await this.scopeEngine.resolveScope(
        dto.workspaceId,
        dto.entityId,
        dto.includeParentScopes !== false,
      );

      const retrievalSettings = this.normalizeRetrievalSettings(
        modelConfig.retrieval_settings,
      );
      const queryPrefix = this.readPrefix(
        retrievalSettings,
        'embedding_query_prefix',
      );
      const embeddingInput = queryPrefix
        ? `${queryPrefix} ${dto.query}`
        : dto.query;

      const embeddingModelKey = modelConfig.embedding?.provider_key;
      if (!embeddingModelKey) {
        throw new BadRequestException(
          'Model config is missing embedding definition',
        );
      }

      const embeddingVectors = await this.runtime.createEmbedding({
        provider: embeddingConn.provider,
        apiKey: embeddingConn.api_key,
        providerConfig: embeddingConn.provider_config,
        model: embeddingModelKey,
        input: embeddingInput,
      });
      const queryVector = embeddingVectors[0];
      if (!queryVector) {
        throw new BadRequestException('Failed to compute query embedding');
      }

      const topK = dto.topK ?? modelConfig.top_k ?? 8;
      const searchResults = await this.vector.search(
        queryVector,
        { workspaceId: dto.workspaceId, entityIds },
        topK,
      );

      const chunkIds = searchResults
        .map((r) => r.payload.chunk_id)
        .filter(Boolean);

      const chunksResult = this.toTyped<{
        data: DocumentChunkQueryRow[] | null;
      }>(
        await this.supabase.admin
          .from('document_chunks')
          .select(
            'id, content, content_ciphertext, content_iv, content_tag, enc_version, is_encrypted, document_id, metadata, chunk_index',
          )
          .in('id', chunkIds),
      );
      const chunks = chunksResult.data ?? [];

      const documentsResult = this.toTyped<{
        data: Array<{ id: string; title: string | null }> | null;
      }>(
        await this.supabase.admin
          .from('documents')
          .select('id, title')
          .in(
            'id',
            chunks.map((c) => c.document_id),
          ),
      );
      const documents = documentsResult.data ?? [];

      const docMap = new Map(documents.map((d) => [d.id, d]));

      const hydratedChunks = await Promise.all(
        chunks.map(async (chunk) => ({
          ...chunk,
          resolvedContent: await this.encryption.resolveChunkContent(
            dto.workspaceId,
            chunk,
          ),
        })),
      );

      const hydratedChunkById = new Map(
        hydratedChunks.map((chunk) => [chunk.id, chunk]),
      );
      type RankedChunk = {
        chunk: (typeof hydratedChunks)[number];
        score?: number;
      };
      const rankedChunks: RankedChunk[] = [];

      for (const result of searchResults) {
        const chunkId = result.payload.chunk_id;
        if (!chunkId) continue;
        const chunk = hydratedChunkById.get(chunkId);
        if (!chunk) continue;
        rankedChunks.push({
          chunk,
          score: typeof result.score === 'number' ? result.score : undefined,
        });
      }

      const context = rankedChunks
        .map(({ chunk }, i) => `[${i + 1}] ${chunk.resolvedContent}`)
        .join('\n\n');

      const llmModelKey = modelConfig.llm?.provider_key;
      if (!llmModelKey) {
        throw new BadRequestException('Model config is missing LLM definition');
      }

      const systemPrompt =
        modelConfig.system_prompt ??
        'You are a helpful assistant. Answer based on the provided context. Cite sources using [1], [2] etc.';

      const completion = await this.runtime.generateChat({
        provider: llmConn.provider,
        apiKey: llmConn.api_key,
        providerConfig: llmConn.provider_config,
        model: llmModelKey,
        temperature: modelConfig.llm?.capabilities?.includes(
          NO_TEMPERATURE_CAPABILITY,
        )
          ? undefined
          : Number(modelConfig.temperature),
        systemPrompt,
        userPrompt: `Context:\n${context}\n\nQuestion: ${dto.query}`,
      });
      const answer = completion.text ?? '';
      const usage = completion.usage;
      const latencyMs = Date.now() - startMs;
      const encryptedQuery = await this.encryption.encryptValue(
        dto.workspaceId,
        dto.query,
      );
      const encryptedAnswer = await this.encryption.encryptValue(
        dto.workspaceId,
        answer,
      );

      const citations = rankedChunks.map(({ chunk, score }, i) => ({
        index: i + 1,
        chunk_id: chunk.id,
        document_id: chunk.document_id,
        document_title: docMap.get(chunk.document_id)?.title ?? null,
        excerpt: chunk.resolvedContent.slice(0, 200),
        matchScoreRaw: score,
      }));
      const retrievedChunkIds = rankedChunks.map(({ chunk }) => chunk.id);

      await this.supabase.admin.from('query_logs').insert({
        workspace_id: dto.workspaceId,
        entity_id: dto.entityId,
        user_id: userId,
        model_config_id: dto.modelConfigId,
        provider_connection_id: llmProviderConnId,
        query_text: '[encrypted]',
        query_text_ciphertext: encryptedQuery.ciphertext,
        query_text_iv: encryptedQuery.iv,
        query_text_tag: encryptedQuery.tag,
        query_text_enc_version: encryptedQuery.encVersion,
        resolved_entity_ids: entityIds,
        retrieved_chunk_ids: retrievedChunkIds,
        answer_text: null,
        answer_text_ciphertext: encryptedAnswer.ciphertext,
        answer_text_iv: encryptedAnswer.iv,
        answer_text_tag: encryptedAnswer.tag,
        answer_text_enc_version: encryptedAnswer.encVersion,
        prompt_tokens: usage?.promptTokens ?? null,
        completion_tokens: usage?.completionTokens ?? null,
        total_tokens: usage?.totalTokens ?? null,
        latency_ms: latencyMs,
        success: true,
        metadata: options?.apiKeyId ? { api_key_id: options.apiKeyId } : {},
      });

      await this.safeAudit({
        workspaceId: dto.workspaceId,
        userId: userId ?? undefined,
        action: 'query',
        resource: 'query_request',
        resourceId: dto.entityId,
        metadata: {
          modelConfigId: dto.modelConfigId,
          entityId: dto.entityId,
          topK,
          debug: Boolean(dto.debug),
          includeParentScopes: dto.includeParentScopes !== false,
        },
      });

      return {
        answer,
        citations,
        meta: dto.debug
          ? {
              resolvedEntityIds: entityIds,
              topK,
              latencyMs,
              tokensUsed: usage?.totalTokens ?? undefined,
              rawSystemPrompt: systemPrompt,
            }
          : undefined,
      };
    } catch (error) {
      const errorCode = this.errorCode(error);
      const errorMessage = this.errorMessage(error);
      // Slim failure row (no ciphertext payloads): keeps dashboard
      // error/throttled aggregates in query_logs so audit_logs is never
      // scanned for analytics.
      await this.safeQueryLogInsert({
        workspace_id: dto.workspaceId,
        entity_id: dto.entityId,
        user_id: userId ?? null,
        model_config_id: dto.modelConfigId ?? null,
        query_text: '[failed]',
        success: false,
        error_message: errorMessage,
        metadata: {
          errorCode,
          errorMessage,
          modelConfigId: dto.modelConfigId,
          entityId: dto.entityId,
        },
      });
      await this.safeAudit({
        workspaceId: dto.workspaceId,
        userId: userId ?? undefined,
        action: 'query',
        resource: 'query_request',
        resourceId: dto.entityId,
        success: false,
        errorCode,
        metadata: {
          modelConfigId: dto.modelConfigId,
          entityId: dto.entityId,
          topK: dto.topK ?? null,
          debug: Boolean(dto.debug),
          includeParentScopes: dto.includeParentScopes !== false,
          errorMessage,
        },
      });
      throw error;
    }
  }

  private errorCode(error: unknown) {
    if (error instanceof Error && error.name) return error.name;
    return 'UnknownError';
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    return 'Unknown error';
  }

  private async safeAudit(input: Parameters<AuditService['logAction']>[0]) {
    try {
      await this.audit.logAction(input);
    } catch (error) {
      void error;
    }
  }

  private async safeQueryLogInsert(row: {
    workspace_id: string;
    entity_id?: string | null;
    user_id?: string | null;
    model_config_id?: string | null;
    query_text: string;
    success: boolean;
    error_message?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.supabase.admin.from('query_logs').insert({
        workspace_id: row.workspace_id,
        entity_id: row.entity_id ?? null,
        user_id: row.user_id ?? null,
        model_config_id: row.model_config_id ?? null,
        query_text: row.query_text,
        success: row.success,
        error_message: row.error_message ?? null,
        metadata: row.metadata ?? {},
      });
    } catch (error) {
      void error;
    }
  }

  private toTyped<T>(value: unknown) {
    return value as T;
  }

  private normalizeRetrievalSettings(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {} as Record<string, unknown>;
    }
    return value as Record<string, unknown>;
  }

  private readPrefix(
    settings: Record<string, unknown>,
    key: 'embedding_query_prefix',
  ) {
    const raw = settings[key];
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
