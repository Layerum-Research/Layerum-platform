import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { VectorService } from '../vector/vector.service';
import { ProviderConnectionsService } from '../provider-connections/provider-connections.service';
import mammoth from 'mammoth';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import path from 'node:path';
import type { Express } from 'express';
import { DataEncryptionService } from '../workspace-encryption/data-encryption.service';
import { ProviderRuntimeService } from '../ai-runtime/provider-runtime.service';
import { StorageService } from '../storage/storage.service';
import type { StorageBackend } from '../storage/storage.types';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { isUnsafeOutboundIpAddress } from '../common/security/outbound-url-policy';
import { NotificationsService } from '../notifications/notifications.service';

type SourceRow = {
  id: string;
  workspace_id: string;
  entity_id: string;
  source_type: 'file' | 'url' | 'text' | 'api';
  display_name: string;
  source_url: string | null;
  source_url_ciphertext: string | null;
  source_url_iv: string | null;
  source_url_tag: string | null;
  raw_text_ciphertext: string | null;
  raw_text_iv: string | null;
  raw_text_tag: string | null;
  sensitive_enc_version: number | null;
  storage_path: string | null;
  storage_backend: StorageBackend | null;
  mime_type: string | null;
  metadata: Record<string, unknown> | null;
};

type ExtractedContent = {
  content: string;
  title: string;
  mimeType: string;
  checksum?: string;
};

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private static readonly EMBEDDING_BATCH_MAX_TOKENS = 250_000;
  private static readonly EMBEDDING_BATCH_MAX_ITEMS = 512;
  private static readonly MAX_REMOTE_REDIRECTS = 5;
  private static readonly MAX_REMOTE_DOWNLOAD_BYTES = 52_428_800;
  private static readonly REMOTE_FETCH_TIMEOUT_MS = 30_000;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly providers: ProviderConnectionsService,
    private readonly vector: VectorService,
    private readonly encryption: DataEncryptionService,
    private readonly runtime: ProviderRuntimeService,
    private readonly storage: StorageService,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifications: NotificationsService,
  ) {}

  async ingestDataSource(dataSourceId: string) {
    let currentStep = 'load_source';
    const debugMeta: Record<string, unknown> = {};

    const { data: source, error } = await this.supabase.admin
      .from('data_sources')
      .select(
        'id, workspace_id, entity_id, created_by, source_type, display_name, source_url, source_url_ciphertext, source_url_iv, source_url_tag, raw_text_ciphertext, raw_text_iv, raw_text_tag, sensitive_enc_version, storage_path, storage_backend, mime_type, metadata',
      )
      .eq('id', dataSourceId)
      .single();

    if (error || !source)
      throw new BadRequestException('Data source not found');

    const { data: job, error: jobError } = await this.supabase.admin
      .from('ingestion_jobs')
      .insert({
        workspace_id: source.workspace_id,
        data_source_id: source.id,
        status: 'pending',
      })
      .select('id')
      .single();

    if (jobError || !job)
      throw new Error(jobError?.message ?? 'Failed to create ingestion job');

    try {
      this.logger.log(
        JSON.stringify({
          event: 'ingestion_started',
          dataSourceId: source.id,
          workspaceId: source.workspace_id,
          entityId: source.entity_id,
          sourceType: source.source_type,
          jobId: job.id,
        }),
      );

      currentStep = 'mark_processing';
      await this.markProcessing(source.id, job.id);

      currentStep = 'extract_text';
      const extracted = await this.extractText(source as SourceRow);
      debugMeta.mime_type = extracted.mimeType;
      debugMeta.extracted_char_count = extracted.content.length;

      currentStep = 'resolve_model_config';
      const modelConfig = await this.resolveModelConfig(source as SourceRow);
      debugMeta.model_config_id = modelConfig.id;
      debugMeta.embedding_provider_connection_id =
        modelConfig.embedding_provider_connection_id;
      debugMeta.embedding_model_key = modelConfig.embedding_model_key;
      debugMeta.embedding_doc_prefix = modelConfig.embedding_doc_prefix ?? null;
      debugMeta.chunk_strategy = modelConfig.chunk_strategy;

      currentStep = 'chunk_text';
      const chunks = this.chunkText(
        extracted.content,
        modelConfig.chunk_strategy,
        modelConfig.chunk_size,
        modelConfig.chunk_overlap,
      );
      debugMeta.chunk_count = chunks.length;

      if (chunks.length === 0)
        throw new Error('No content extracted from source');

      currentStep = 'job_update_parsed';
      await this.updateJob(job.id, {
        steps_completed: ['source_loaded', 'parsed', 'chunked'],
        metadata: { chunk_count: chunks.length },
      });

      currentStep = 'create_document';
      const { data: document, error: documentError } = await this.supabase.admin
        .from('documents')
        .insert({
          workspace_id: source.workspace_id,
          entity_id: source.entity_id,
          data_source_id: source.id,
          title: extracted.title ?? source.display_name,
          mime_type: source.mime_type ?? extracted.mimeType ?? null,
          storage_path: source.storage_path,
          storage_backend: source.storage_backend ?? 'none',
          checksum: extracted.checksum ?? null,
          char_count: extracted.content.length,
          status: 'processing',
          metadata: { source_type: source.source_type },
        })
        .select('id')
        .single();

      if (documentError || !document)
        throw new Error(documentError?.message ?? 'Failed to create document');
      debugMeta.document_id = document.id;

      currentStep = 'create_chunks';
      const encryptedChunks = await this.encryption.encryptChunks(
        source.workspace_id,
        chunks,
      );
      const chunkRows = chunks.map((content, index) => ({
        workspace_id: source.workspace_id,
        entity_id: source.entity_id,
        document_id: document.id,
        chunk_index: index,
        content: encryptedChunks[index].content,
        content_ciphertext: encryptedChunks[index].content_ciphertext,
        content_iv: encryptedChunks[index].content_iv,
        content_tag: encryptedChunks[index].content_tag,
        enc_version: encryptedChunks[index].enc_version,
        is_encrypted: encryptedChunks[index].is_encrypted,
        token_count: Math.ceil(content.length / 4),
        embedding_status: 'pending',
        metadata: { source_id: source.id },
      }));

      const { data: insertedChunks, error: chunkError } =
        await this.supabase.admin
          .from('document_chunks')
          .insert(chunkRows)
          .select('id, chunk_index')
          .returns<Array<{ id: string; chunk_index: number }>>();

      if (chunkError || !insertedChunks)
        throw new Error(chunkError?.message ?? 'Failed to create chunks');

      currentStep = 'enforce_storage_capacity';
      try {
        await this.subscriptions.assertWorkspaceWithinCapacity(
          source.workspace_id,
        );
      } catch (capacityError) {
        await this.rollbackDocument(source.workspace_id, document.id);
        throw capacityError;
      }

      currentStep = 'resolve_embedding_provider';
      const embeddingConn = await this.providers.getRuntimeConnection(
        source.workspace_id,
        modelConfig.embedding_provider_connection_id,
      );

      currentStep = 'embed_chunks';
      const embeddingInputs = this.applyDocPrefix(
        chunks,
        modelConfig.embedding_doc_prefix,
      );
      const embeddingBatches = this.buildEmbeddingBatches(embeddingInputs);
      debugMeta.embedding_batch_count = embeddingBatches.length;
      debugMeta.embedding_batch_max_tokens =
        IngestionService.EMBEDDING_BATCH_MAX_TOKENS;
      debugMeta.embedding_batch_max_items =
        IngestionService.EMBEDDING_BATCH_MAX_ITEMS;

      const embeddingVectors: number[][] = [];
      for (const batch of embeddingBatches) {
        const vectors = await this.runtime.createEmbedding({
          provider: embeddingConn.provider,
          apiKey: embeddingConn.api_key,
          providerConfig: embeddingConn.provider_config,
          model: modelConfig.embedding_model_key,
          input: batch,
        });
        if (vectors.length !== batch.length) {
          throw new Error(
            `Embedding vector count mismatch in batch: expected ${batch.length}, got ${vectors.length}`,
          );
        }
        embeddingVectors.push(...vectors);
      }
      if (embeddingVectors.length !== insertedChunks.length) {
        throw new Error(
          `Embedding vector count mismatch: expected ${insertedChunks.length}, got ${embeddingVectors.length}`,
        );
      }

      const points = insertedChunks.map((chunk, index) => ({
        id: chunk.id,
        vector: embeddingVectors[index],
        payload: {
          workspace_id: source.workspace_id,
          entity_id: source.entity_id,
          document_id: document.id,
          chunk_id: chunk.id,
          chunk_index: chunk.chunk_index,
        },
      }));

      currentStep = 'vector_upsert';
      const vectorUpsert = await this.vector.upsert(points);
      debugMeta.embedding_dimension = vectorUpsert.dimension;
      debugMeta.vector_collection_name = vectorUpsert.collectionName;

      currentStep = 'mark_embeddings_completed';
      await this.supabase.admin
        .from('document_chunks')
        .update({ embedding_status: 'completed' })
        .in(
          'id',
          insertedChunks.map((c) => c.id),
        );

      currentStep = 'create_vector_records';
      await this.supabase.admin.from('vector_records').insert(
        insertedChunks.map((chunk) => ({
          workspace_id: source.workspace_id,
          entity_id: source.entity_id,
          document_id: document.id,
          chunk_id: chunk.id,
          vector_provider: this.vector.getProvider(),
          collection_name: vectorUpsert.collectionName,
          vector_point_id: chunk.id,
        })),
      );

      currentStep = 'mark_document_completed';
      await this.supabase.admin
        .from('documents')
        .update({ status: 'completed' })
        .eq('id', document.id);

      currentStep = 'mark_source_completed';
      await this.supabase.admin
        .from('data_sources')
        .update({ status: 'completed' })
        .eq('id', source.id);

      currentStep = 'mark_job_completed';
      await this.supabase.admin
        .from('ingestion_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          steps_completed: [
            'source_loaded',
            'parsed',
            'chunked',
            'embedded',
            'upserted',
          ],
          metadata: {
            chunk_count: insertedChunks.length,
            document_id: document.id,
            embedding_dimension: vectorUpsert.dimension,
            vector_collection_name: vectorUpsert.collectionName,
          },
        })
        .eq('id', job.id);

      this.logger.log(
        JSON.stringify({
          event: 'ingestion_completed',
          dataSourceId: source.id,
          workspaceId: source.workspace_id,
          entityId: source.entity_id,
          jobId: job.id,
          ...debugMeta,
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Ingestion failed';
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        JSON.stringify({
          event: 'ingestion_failed',
          dataSourceId: source.id,
          workspaceId: source.workspace_id,
          entityId: source.entity_id,
          jobId: job.id,
          failed_step: currentStep,
          error: message,
          ...debugMeta,
        }),
        stack,
      );

      await this.supabase.admin
        .from('data_sources')
        .update({ status: 'failed' })
        .eq('id', source.id);

      await this.supabase.admin
        .from('ingestion_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: message,
          metadata: {
            failed_step: currentStep,
            ...debugMeta,
          },
        })
        .eq('id', job.id);

      if (source.created_by) {
        await this.notifications.notify({
          type: 'ingestion_failed',
          workspaceId: source.workspace_id,
          uploaderUserId: source.created_by,
          dataSourceId: source.id,
          entityId: source.entity_id,
          displayName: source.display_name ?? 'Untitled source',
        });
      }
    }
  }

  async uploadFile(input: {
    workspaceId: string;
    entityId: string;
    file: Express.Multer.File;
  }) {
    const safeFileName = input.file.originalname.replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );
    const storagePath = this.buildStoragePath(
      input.workspaceId,
      input.entityId,
      safeFileName,
    );
    await this.storage.uploadBuffer({
      objectKey: storagePath,
      buffer: input.file.buffer,
      contentType: input.file.mimetype || 'application/octet-stream',
    });

    return {
      storagePath,
      mimeType: input.file.mimetype,
      fileSize: input.file.size,
      checksum: createHash('sha256').update(input.file.buffer).digest('hex'),
    };
  }

  private async markProcessing(sourceId: string, jobId: string) {
    await this.supabase.admin
      .from('data_sources')
      .update({ status: 'processing' })
      .eq('id', sourceId);

    await this.supabase.admin
      .from('ingestion_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        steps_completed: ['source_loaded'],
      })
      .eq('id', jobId);
  }

  private async updateJob(
    jobId: string,
    values: { steps_completed?: string[]; metadata?: Record<string, unknown> },
  ) {
    await this.supabase.admin
      .from('ingestion_jobs')
      .update(values)
      .eq('id', jobId);
  }

  private async rollbackDocument(workspaceId: string, documentId: string) {
    await this.supabase.admin
      .from('documents')
      .delete()
      .eq('id', documentId)
      .eq('workspace_id', workspaceId);
  }

  private async resolveModelConfig(source: SourceRow) {
    const requestedModelConfigId =
      typeof source.metadata?.['model_config_id'] === 'string'
        ? source.metadata['model_config_id']
        : null;

    if (requestedModelConfigId) {
      const selected = await this.fetchModelConfigById(
        source.workspace_id,
        source.entity_id,
        requestedModelConfigId,
      );
      if (selected) return selected;
    }

    const { data, error } = await this.supabase.admin
      .from('model_configs')
      .select(
        'id, entity_id, provider_connection_id, embedding_provider_connection_id, chunk_size, chunk_overlap, retrieval_settings, embedding:model_definitions!embedding_model_id(provider, provider_key)',
      )
      .eq('workspace_id', source.workspace_id)
      .or(`entity_id.eq.${source.entity_id},entity_id.is.null`)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0)
      throw new Error('No model config available for ingestion');

    const sorted = [...data].sort((a, b) => {
      const aScore = a.entity_id === source.entity_id ? 0 : 1;
      const bScore = b.entity_id === source.entity_id ? 0 : 1;
      return aScore - bScore;
    });

    return this.normalizeModelConfig(sorted[0], source.entity_id);
  }

  private async fetchModelConfigById(
    workspaceId: string,
    entityId: string,
    modelConfigId: string,
  ) {
    const { data, error } = await this.supabase.admin
      .from('model_configs')
      .select(
        'id, entity_id, provider_connection_id, embedding_provider_connection_id, chunk_size, chunk_overlap, retrieval_settings, embedding:model_definitions!embedding_model_id(provider, provider_key)',
      )
      .eq('id', modelConfigId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      throw new Error('Selected model config not found in this workspace');
    }
    return this.normalizeModelConfig(data, entityId);
  }

  private normalizeModelConfig(
    row: {
      id?: string;
      entity_id?: string | null;
      provider_connection_id: string | null;
      embedding_provider_connection_id?: string | null;
      chunk_size: number | null;
      chunk_overlap: number | null;
      retrieval_settings?: Record<string, unknown> | null;
      embedding:
        | { provider: string; provider_key: string }[]
        | { provider: string; provider_key: string }
        | null;
    },
    entityId: string,
  ) {
    if (row.entity_id && row.entity_id !== entityId) {
      throw new Error('Selected model config is not available for this entity');
    }

    const embedding = Array.isArray(row.embedding)
      ? row.embedding[0]
      : row.embedding;

    const embeddingProviderConnectionId =
      row.embedding_provider_connection_id ?? row.provider_connection_id;
    if (!embeddingProviderConnectionId) {
      throw new Error('Model config is missing embedding provider connection');
    }
    if (!embedding?.provider_key)
      throw new Error('Model config is missing embedding model');

    return {
      id: row.id ?? null,
      embedding_provider_connection_id: embeddingProviderConnectionId,
      chunk_size: row.chunk_size ?? 512,
      chunk_overlap: row.chunk_overlap ?? 64,
      chunk_strategy:
        this.readChunkStrategyFromSettings(row.retrieval_settings) ?? 'sliding',
      embedding_doc_prefix: this.readPrefixFromSettings(
        row.retrieval_settings,
        'embedding_doc_prefix',
      ),
      embedding_model_key: embedding.provider_key,
    };
  }

  private async extractText(source: SourceRow): Promise<ExtractedContent> {
    if (source.source_type === 'url') {
      const url = await this.resolveSourceUrl(source);
      const normalizedUrl = this.normalizeRemoteUrl(url);
      const res = await this.fetchRemoteUrl(normalizedUrl);
      if (!res.ok) throw new Error(`Failed to fetch URL (${res.status})`);

      const contentType = (
        res.headers.get('content-type') ?? 'application/octet-stream'
      )
        .toLowerCase()
        .split(';')[0]
        .trim();

      if (contentType === 'application/pdf') {
        const buffer = await this.readResponseBuffer(res);
        const parsedText = await this.parsePdfText(buffer);
        return {
          content: this.normalizeText(parsedText),
          title: source.display_name,
          mimeType: 'application/pdf',
          checksum: createHash('sha256').update(buffer).digest('hex'),
        };
      }

      if (
        contentType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        const buffer = await this.readResponseBuffer(res);
        const parsed = await mammoth.extractRawText({ buffer });
        return {
          content: this.normalizeText(parsed.value),
          title: source.display_name,
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          checksum: createHash('sha256').update(buffer).digest('hex'),
        };
      }

      if (contentType.startsWith('text/') || contentType === 'text/html') {
        const text = (await this.readResponseBuffer(res)).toString('utf8');
        if (contentType === 'text/html') {
          if (this.isGoogleViewerErrorPage(normalizedUrl, text)) {
            throw new Error(
              'Google Drive returned viewer/login page instead of file content. Make the file public ("Anyone with the link") or provide a direct download/export URL.',
            );
          }
          const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const title = titleMatch?.[1]?.trim() || source.display_name;
          return {
            content: this.normalizeText(this.stripHtml(text)),
            title,
            mimeType: contentType,
          };
        }

        return {
          content: this.normalizeText(text),
          title: source.display_name,
          mimeType: contentType,
        };
      }

      throw new Error(
        `Unsupported URL content type: ${contentType || 'unknown'}`,
      );
    }

    if (source.source_type === 'text') {
      const rawText = await this.resolveRawText(source);
      if (!rawText) throw new Error('No text content found');
      return {
        content: this.normalizeText(rawText),
        title: source.display_name,
        mimeType: 'text/plain',
      };
    }

    if (source.source_type === 'file') {
      if (!source.storage_path) throw new Error('Missing file storage path');
      if (source.storage_backend !== 's3') {
        throw new Error(
          'Legacy file source is frozen after storage migration and cannot be re-processed.',
        );
      }
      return this.extractTextFromFile(
        source.storage_path,
        source.mime_type,
        source.display_name,
      );
    }

    throw new Error(`Unsupported source type: ${source.source_type}`);
  }

  private async resolveSourceUrl(source: SourceRow): Promise<string> {
    if (
      source.source_url_ciphertext &&
      source.source_url_iv &&
      source.source_url_tag &&
      source.sensitive_enc_version
    ) {
      return this.encryption.decryptValue(source.workspace_id, {
        ciphertext: source.source_url_ciphertext,
        iv: source.source_url_iv,
        tag: source.source_url_tag,
        encVersion: source.sensitive_enc_version,
      });
    }
    if (source.source_url) return source.source_url;
    throw new Error('Missing source URL');
  }

  private async resolveRawText(source: SourceRow): Promise<string> {
    if (
      source.raw_text_ciphertext &&
      source.raw_text_iv &&
      source.raw_text_tag &&
      source.sensitive_enc_version
    ) {
      return this.encryption.decryptValue(source.workspace_id, {
        ciphertext: source.raw_text_ciphertext,
        iv: source.raw_text_iv,
        tag: source.raw_text_tag,
        encVersion: source.sensitive_enc_version,
      });
    }
    return typeof source.metadata?.['raw_text'] === 'string'
      ? String(source.metadata['raw_text'])
      : '';
  }

  private normalizeRemoteUrl(url: string): string {
    try {
      const parsed = new URL(url);

      const isDrive =
        parsed.hostname === 'drive.google.com' ||
        parsed.hostname.endsWith('.drive.google.com');
      if (isDrive) {
        const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
        const id = fileMatch?.[1] ?? parsed.searchParams.get('id');
        if (id) {
          return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
        }

        if (parsed.pathname === '/open') {
          const openId = parsed.searchParams.get('id');
          if (openId) {
            return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(openId)}`;
          }
        }
      }

      const isGoogleDocs =
        parsed.hostname === 'docs.google.com' ||
        parsed.hostname.endsWith('.docs.google.com');
      if (isGoogleDocs) {
        const docMatch = parsed.pathname.match(/^\/document\/d\/([^/]+)/);
        if (docMatch?.[1]) {
          return `https://docs.google.com/document/d/${encodeURIComponent(docMatch[1])}/export?format=txt`;
        }
        const sheetMatch = parsed.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
        if (sheetMatch?.[1]) {
          return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetMatch[1])}/export?format=csv`;
        }
        const presentationMatch = parsed.pathname.match(
          /^\/presentation\/d\/([^/]+)/,
        );
        if (presentationMatch?.[1]) {
          return `https://docs.google.com/presentation/d/${encodeURIComponent(presentationMatch[1])}/export/txt`;
        }
      }

      return parsed.toString();
    } catch {
      return url;
    }
  }

  private async fetchRemoteUrl(url: string): Promise<Response> {
    const parsed = this.safeUrl(url);
    if (
      parsed &&
      parsed.hostname === 'drive.google.com' &&
      parsed.pathname === '/uc'
    ) {
      const id = parsed.searchParams.get('id');
      if (id) {
        const first = await this.fetchWithRedirectPolicy(url);
        if (!first.ok) return first;
        const firstContentType = (first.headers.get('content-type') ?? '')
          .toLowerCase()
          .split(';')[0]
          .trim();
        if (firstContentType === 'text/html') {
          const html = await first.text();
          const confirm = this.extractGoogleDriveConfirmToken(html);
          if (confirm) {
            const cookieHeader = this.extractCookieHeader(first);
            const confirmUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}&confirm=${encodeURIComponent(confirm)}`;
            return this.fetchWithRedirectPolicy(confirmUrl, {
              headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
            });
          }
          throw new Error(
            'Google Drive did not return a downloadable file. Ensure the file is publicly accessible.',
          );
        }
        return first;
      }
    }

    return this.fetchWithRedirectPolicy(url);
  }

  private async fetchWithRedirectPolicy(
    url: string,
    init?: Omit<RequestInit, 'redirect' | 'signal'>,
  ): Promise<Response> {
    let current = url;
    let redirects = 0;

    while (redirects <= IngestionService.MAX_REMOTE_REDIRECTS) {
      const parsed = this.safeUrl(current);
      if (!parsed) throw new Error('Invalid remote URL');

      await this.assertRemoteTargetAllowed(parsed);

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        IngestionService.REMOTE_FETCH_TIMEOUT_MS,
      );
      let response: Response;
      try {
        response = await fetch(current, {
          ...(init ?? {}),
          redirect: 'manual',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!this.isRedirectStatus(response.status)) {
        return response;
      }

      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Redirect response is missing location header');
      }

      current = new URL(location, parsed).toString();
      redirects += 1;
    }

    throw new Error('Too many redirects while fetching remote URL');
  }

  private isRedirectStatus(status: number) {
    return (
      status === 301 ||
      status === 302 ||
      status === 303 ||
      status === 307 ||
      status === 308
    );
  }

  private async assertRemoteTargetAllowed(url: URL) {
    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      throw new Error(`Unsupported URL protocol: ${protocol}`);
    }

    const host = url.hostname
      .trim()
      .toLowerCase()
      .replace(/^\[|\]$/g, '');
    if (!host) {
      throw new Error('Remote URL host is required');
    }
    if (this.isLocalHostname(host)) {
      throw new Error(`Remote URL host is not allowed: ${host}`);
    }

    if (isUnsafeOutboundIpAddress(host)) {
      throw new Error(`Remote URL host is not allowed: ${host}`);
    }

    let resolved: Array<{ address: string }> = [];
    try {
      resolved = await lookup(host, { all: true, verbatim: true });
    } catch (error) {
      throw new Error(
        `Failed to resolve remote host ${host}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (resolved.length === 0) {
      throw new Error(
        `Remote host did not resolve to any IP addresses: ${host}`,
      );
    }

    for (const entry of resolved) {
      if (isUnsafeOutboundIpAddress(entry.address)) {
        throw new Error(
          `Remote URL resolves to a private address: ${entry.address}`,
        );
      }
    }
  }

  private isLocalHostname(host: string) {
    return (
      host === 'localhost' ||
      host === 'localhost.localdomain' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local')
    );
  }

  private extractGoogleDriveConfirmToken(html: string): string | null {
    const fromHref = html.match(/[?&]confirm=([0-9A-Za-z_-]+)/);
    if (fromHref?.[1]) return fromHref[1];

    const fromInput = html.match(/name="confirm"\s+value="([^"]+)"/i);
    if (fromInput?.[1]) return fromInput[1];

    return null;
  }

  private extractCookieHeader(res: Response): string | null {
    const headersWithSetCookie = res.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const rawCookies =
      typeof headersWithSetCookie.getSetCookie === 'function'
        ? headersWithSetCookie.getSetCookie()
        : res.headers.get('set-cookie')
          ? [res.headers.get('set-cookie') as string]
          : [];
    if (rawCookies.length === 0) return null;
    const cookiePairs = rawCookies
      .map((cookie) => cookie.split(';')[0]?.trim())
      .filter((value): value is string => Boolean(value));
    return cookiePairs.length > 0 ? cookiePairs.join('; ') : null;
  }

  private isGoogleViewerErrorPage(url: string, html: string): boolean {
    const parsed = this.safeUrl(url);
    if (!parsed) return false;
    const host = parsed.hostname.toLowerCase();
    const isGoogleHost =
      host === 'drive.google.com' ||
      host === 'docs.google.com' ||
      host.endsWith('.drive.google.com') ||
      host.endsWith('.docs.google.com');
    if (!isGoogleHost) return false;

    const value = html.toLowerCase();
    return (
      value.includes('javascript') ||
      value.includes('sign in') ||
      value.includes('need access') ||
      value.includes('google drive') ||
      value.includes('このファイルは開けません') ||
      value.includes('ログイン')
    );
  }

  private safeUrl(value: string): URL | null {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }

  private async readResponseBuffer(res: Response): Promise<Buffer> {
    const declaredLength = Number(res.headers.get('content-length') ?? 0);
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > IngestionService.MAX_REMOTE_DOWNLOAD_BYTES
    ) {
      throw new Error('Remote content is too large');
    }

    if (!res.body) {
      const fallback = Buffer.from(await res.arrayBuffer());
      if (fallback.length > IngestionService.MAX_REMOTE_DOWNLOAD_BYTES) {
        throw new Error('Remote content is too large');
      }
      return fallback;
    }

    const reader = res.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > IngestionService.MAX_REMOTE_DOWNLOAD_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('Remote content is too large');
      }
      chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks, total);
  }

  private async extractTextFromFile(
    storagePath: string,
    mimeType: string | null,
    fileName: string,
  ): Promise<ExtractedContent> {
    const buffer = await this.storage.downloadBuffer(storagePath);
    const ext = path.extname(fileName).toLowerCase();

    if (mimeType?.startsWith('text/') || ext === '.txt' || ext === '.md') {
      return {
        content: this.normalizeText(buffer.toString('utf8')),
        title: fileName,
        mimeType: mimeType ?? 'text/plain',
        checksum: createHash('sha256').update(buffer).digest('hex'),
      };
    }

    if (mimeType === 'application/pdf' || ext === '.pdf') {
      const parsedText = await this.parsePdfText(buffer);
      return {
        content: this.normalizeText(parsedText),
        title: fileName,
        mimeType: 'application/pdf',
        checksum: createHash('sha256').update(buffer).digest('hex'),
      };
    }

    if (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === '.docx'
    ) {
      const parsed = await mammoth.extractRawText({ buffer });
      return {
        content: this.normalizeText(parsed.value),
        title: fileName,
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        checksum: createHash('sha256').update(buffer).digest('hex'),
      };
    }

    throw new Error(`Unsupported file type: ${mimeType ?? (ext || 'unknown')}`);
  }

  buildStoragePath(
    workspaceId: string,
    entityId: string,
    safeFileName: string,
  ) {
    return `workspaces/${workspaceId}/entities/${entityId}/sources/${Date.now()}-${safeFileName}`;
  }

  private chunkText(
    content: string,
    chunkStrategy: 'fixed' | 'sliding' | 'semantic',
    chunkSize: number,
    chunkOverlap: number,
  ) {
    const normalized = this.normalizeText(content);
    if (!normalized) return [];

    const size = Math.max(128, chunkSize);
    const overlap = Math.min(Math.max(0, chunkOverlap), size - 1);

    if (chunkStrategy === 'fixed') {
      return this.chunkFixed(normalized, size);
    }
    if (chunkStrategy === 'semantic') {
      return this.chunkSemantic(normalized, size, overlap);
    }
    return this.chunkSliding(normalized, size, overlap);
  }

  private async parsePdfText(buffer: Buffer): Promise<string> {
    const module = await import('pdf-parse');
    const PDFParseCtor = module.PDFParse;
    const parser = new PDFParseCtor({ data: buffer });
    try {
      const parsed = await parser.getText();
      return parsed.text;
    } finally {
      await parser.destroy();
    }
  }

  private chunkSliding(
    content: string,
    chunkSize: number,
    chunkOverlap: number,
  ) {
    const chunks: string[] = [];
    let start = 0;

    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      const chunk = content.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
      if (end >= content.length) break;
      const nextStart = end - chunkOverlap;
      if (nextStart <= start) break;
      start = nextStart;
    }

    return chunks;
  }

  private chunkFixed(content: string, chunkSize: number) {
    const chunks: string[] = [];
    let start = 0;
    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      const chunk = content.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
      start = end;
    }
    return chunks;
  }

  private chunkSemantic(
    content: string,
    chunkSize: number,
    chunkOverlap: number,
  ) {
    const units = this.splitSemanticUnits(content);
    if (units.length === 0)
      return this.chunkSliding(content, chunkSize, chunkOverlap);

    const chunks: string[] = [];
    let current = '';
    for (const unit of units) {
      const trimmedUnit = unit.trim();
      if (!trimmedUnit) continue;
      if (trimmedUnit.length > chunkSize) {
        if (current.trim()) {
          chunks.push(current.trim());
          current = '';
        }
        const longUnitChunks = this.chunkSliding(
          trimmedUnit,
          chunkSize,
          chunkOverlap,
        );
        chunks.push(...longUnitChunks);
        continue;
      }

      const candidate = current ? `${current}\n${trimmedUnit}` : trimmedUnit;
      if (candidate.length <= chunkSize) {
        current = candidate;
        continue;
      }

      if (current.trim()) {
        chunks.push(current.trim());
      }

      const overlapPrefix =
        chunkOverlap > 0 && chunks.length > 0
          ? chunks[chunks.length - 1].slice(-chunkOverlap).trim()
          : '';
      current = overlapPrefix
        ? `${overlapPrefix}\n${trimmedUnit}`
        : trimmedUnit;
      if (current.length > chunkSize) {
        const fallback = this.chunkSliding(current, chunkSize, chunkOverlap);
        chunks.push(...fallback);
        current = '';
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks;
  }

  private splitSemanticUnits(content: string) {
    const paragraphs = content
      .split(/\n{2,}/g)
      .map((item) => item.trim())
      .filter(Boolean);
    if (paragraphs.length <= 1) {
      return content
        .split(/(?<=[.!?。！？])\s+/g)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    const units: string[] = [];
    for (const paragraph of paragraphs) {
      const sentenceParts = paragraph
        .split(/(?<=[.!?。！？])\s+/g)
        .map((item) => item.trim())
        .filter(Boolean);
      if (sentenceParts.length <= 1) {
        units.push(paragraph);
      } else {
        units.push(...sentenceParts);
      }
    }
    return units;
  }

  private buildEmbeddingBatches(chunks: string[]) {
    const batches: string[][] = [];
    let currentBatch: string[] = [];
    let currentBatchTokens = 0;

    for (const chunk of chunks) {
      const chunkTokens = this.estimateTokens(chunk);
      if (chunkTokens > IngestionService.EMBEDDING_BATCH_MAX_TOKENS) {
        throw new Error(
          `Single chunk token estimate ${chunkTokens} exceeds embedding batch token limit ${IngestionService.EMBEDDING_BATCH_MAX_TOKENS}. Reduce chunk_size in model config.`,
        );
      }

      const exceedsTokenLimit =
        currentBatchTokens + chunkTokens >
        IngestionService.EMBEDDING_BATCH_MAX_TOKENS;
      const exceedsItemsLimit =
        currentBatch.length >= IngestionService.EMBEDDING_BATCH_MAX_ITEMS;

      if (currentBatch.length > 0 && (exceedsTokenLimit || exceedsItemsLimit)) {
        batches.push(currentBatch);
        currentBatch = [];
        currentBatchTokens = 0;
      }

      currentBatch.push(chunk);
      currentBatchTokens += chunkTokens;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  private applyDocPrefix(chunks: string[], prefix: string | null) {
    const value = prefix?.trim();
    if (!value) return chunks;
    return chunks.map((chunk) => `${value} ${chunk}`);
  }

  private readPrefixFromSettings(
    retrievalSettings: Record<string, unknown> | null | undefined,
    key: 'embedding_doc_prefix',
  ) {
    if (
      !retrievalSettings ||
      typeof retrievalSettings !== 'object' ||
      Array.isArray(retrievalSettings)
    ) {
      return null;
    }
    const raw = retrievalSettings[key];
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private readChunkStrategyFromSettings(
    retrievalSettings: Record<string, unknown> | null | undefined,
  ): 'fixed' | 'sliding' | 'semantic' | null {
    if (
      !retrievalSettings ||
      typeof retrievalSettings !== 'object' ||
      Array.isArray(retrievalSettings)
    ) {
      return null;
    }
    const raw = retrievalSettings['chunk_strategy'];
    if (raw === 'fixed' || raw === 'sliding' || raw === 'semantic') {
      return raw;
    }
    return null;
  }

  private estimateTokens(content: string) {
    const normalizedLength = content.trim().length;
    if (normalizedLength <= 0) return 1;
    return Math.ceil(normalizedLength / 4);
  }

  private stripHtml(html: string) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  private normalizeText(text: string) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
