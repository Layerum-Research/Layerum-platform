import { HttpClient } from "./http";
import type {
  CreateEntityInput,
  CreateEntityTypeInput,
  CreateModelConfigInput,
  CreateProviderInput,
  CreateTextDocumentInput,
  CreateUrlDocumentInput,
  DataSource,
  DeleteDocumentInput,
  Entity,
  EntityType,
  LayerumClientOptions,
  ListModelDefinitionsInput,
  ListSourcesInput,
  ModelConfig,
  ModelDefinition,
  ProviderConnection,
  QueryInput,
  QueryResponse,
  SourceErrorDetails,
  UploadInitInput,
  UploadInitResponse,
  UploadDocumentInput,
  UploadFileInput,
  Visibility,
  UUID,
  UpdateModelConfigInput,
  WaitUntilReadyInput,
} from "./types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBlob(file: UploadFileInput): Blob {
  if (typeof Blob !== "undefined" && file instanceof Blob) return file;
  if (file instanceof ArrayBuffer) return new Blob([file as unknown as BlobPart]);
  if (file instanceof Uint8Array) {
    return new Blob([file as unknown as BlobPart]);
  }
  return new Blob([file as unknown as BlobPart]);
}

function unwrapItems<T>(payload: { items?: T[] } | T[] | null | undefined): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.items ?? [];
}

class EntitiesApi {
  constructor(private readonly http: HttpClient) {}

  async list(parentId?: UUID) {
    const payload = await this.http.request<{ items?: Entity[] }>("/v1/entities");
    const items = unwrapItems(payload);
    if (!parentId) return items;
    return items.filter(
      (item) => (item.parentId ?? item.parent_id ?? null) === parentId,
    );
  }

  async tree() {
    const payload = await this.http.request<{ items?: Entity[] }>("/v1/entities/tree");
    return unwrapItems(payload);
  }

  create(input: CreateEntityInput) {
    return this.http.request<Entity>("/v1/entities", {
      method: "POST",
      body: {
        entity_type_id: input.entityTypeId,
        name: input.name,
        description: input.description,
        parent_id: input.parentId,
        metadata: input.metadata,
      },
    });
  }

  remove(entityId: UUID) {
    return this.http.request<{ success: boolean }>(`/v1/entities/${entityId}`, {
      method: "DELETE",
    });
  }
}

class EntityTypesApi {
  constructor(private readonly http: HttpClient) {}

  async list() {
    const payload = await this.http.request<{ items?: EntityType[] }>(
      "/v1/entity-types",
    );
    return unwrapItems(payload);
  }

  get(entityTypeId: UUID) {
    return this.http.request<EntityType>(`/v1/entity-types/${entityTypeId}`);
  }

  create(input: CreateEntityTypeInput) {
    return this.http.request<EntityType>("/v1/entity-types", {
      method: "POST",
      body: {
        name: input.name,
        label: input.label,
      },
    });
  }

  remove(entityTypeId: UUID) {
    return this.http.request<{ success: boolean }>(
      `/v1/entity-types/${entityTypeId}`,
      {
        method: "DELETE",
      },
    );
  }
}

class DocumentsApi {
  constructor(private readonly http: HttpClient) {}

  async list(input: ListSourcesInput) {
    const path = input.allInWorkspace
      ? "/v1/documents"
      : `/v1/entities/${input.entityId}/documents`;
    const payload = await this.http.request<{ items?: DataSource[] }>(path);
    return unwrapItems(payload);
  }

  get(entityId: UUID, sourceId: UUID) {
    return this.http.request<DataSource>(
      `/v1/entities/${entityId}/documents/${sourceId}`,
    );
  }

  upload(input: UploadDocumentInput) {
    const form = new FormData();
    form.set("file", toBlob(input.file), input.fileName);
    if (input.visibility) form.set("visibility", input.visibility);
    if (input.modelConfigId) form.set("model_config_id", input.modelConfigId);

    return this.http.request<DataSource>(
      `/v1/entities/${input.entityId}/documents/upload`,
      {
        method: "POST",
        body: form,
        isFormData: true,
      },
    );
  }

  uploadInit(input: UploadInitInput) {
    return this.http.request<UploadInitResponse>(
      `/v1/entities/${input.entityId}/documents/upload/init`,
      {
        method: "POST",
        body: {
          file_name: input.fileName,
          file_size_bytes: input.fileSizeBytes,
          content_type: input.contentType,
          visibility: input.visibility,
          model_config_id: input.modelConfigId,
        },
      },
    );
  }

  uploadComplete(input: {
    entityId: UUID;
    uploadId: UUID;
    displayName?: string;
    visibility?: Visibility;
    modelConfigId?: UUID;
    checksum?: string;
  }) {
    return this.http.request<DataSource>(
      `/v1/entities/${input.entityId}/documents/upload/complete`,
      {
        method: "POST",
        body: {
          upload_id: input.uploadId,
          display_name: input.displayName,
          visibility: input.visibility,
          model_config_id: input.modelConfigId,
          checksum: input.checksum,
        },
      },
    );
  }

  async uploadDirect(input: UploadDocumentInput) {
    const blob = toBlob(input.file);
    const contentType =
      input.contentType || blob.type || "application/octet-stream";

    const initialized = await this.uploadInit({
      entityId: input.entityId,
      fileName: input.fileName,
      fileSizeBytes: blob.size,
      contentType,
      visibility: input.visibility,
      modelConfigId: input.modelConfigId,
    });

    const form = new FormData();
    for (const [key, value] of Object.entries(initialized.fields ?? {})) {
      form.set(key, value);
    }
    form.set("file", blob, input.fileName);

    const uploadRes = await fetch(initialized.uploadUrl, {
      method: initialized.method ?? "POST",
      body: form,
    });
    if (!uploadRes.ok) {
      throw new Error(`Direct upload failed with status ${uploadRes.status}`);
    }

    return this.uploadComplete({
      entityId: input.entityId,
      uploadId: initialized.uploadId,
      displayName: input.fileName,
      visibility: input.visibility,
      modelConfigId: input.modelConfigId,
    });
  }

  createText(input: CreateTextDocumentInput) {
    return this.http.request<DataSource>(`/v1/entities/${input.entityId}/documents`, {
      method: "POST",
      body: {
        source_type: "text",
        display_name: input.displayName,
        raw_text: input.rawText,
        visibility: input.visibility ?? "self_and_descendants",
        model_config_id: input.modelConfigId,
      },
    });
  }

  createUrl(input: CreateUrlDocumentInput) {
    return this.http.request<DataSource>(`/v1/entities/${input.entityId}/documents`, {
      method: "POST",
      body: {
        source_type: "url",
        display_name: input.displayName,
        source_url: input.sourceUrl,
        visibility: input.visibility ?? "self_and_descendants",
        model_config_id: input.modelConfigId,
      },
    });
  }

  remove(input: DeleteDocumentInput) {
    return this.http.request<{ success: boolean }>(
      `/v1/entities/${input.entityId}/documents/${input.sourceId}`,
      {
        method: "DELETE",
      },
    );
  }
}

class IngestionApi {
  constructor(
    private readonly http: HttpClient,
    private readonly documentsApi: DocumentsApi,
  ) {}

  retry(input: { entityId: UUID; sourceId: UUID }) {
    return this.http.request<{ success: boolean; queued: boolean; dataSourceId: UUID }>(
      `/v1/entities/${input.entityId}/documents/${input.sourceId}/retry`,
      {
        method: "POST",
      },
    );
  }

  error(input: { entityId: UUID; sourceId: UUID }) {
    return this.http.request<SourceErrorDetails>(
      `/v1/entities/${input.entityId}/documents/${input.sourceId}/error`,
    );
  }

  async waitUntilReady(input: WaitUntilReadyInput) {
    const timeoutMs = input.timeoutMs ?? 120_000;
    const intervalMs = input.intervalMs ?? 2_000;
    const start = Date.now();

    while (true) {
      const source = await this.documentsApi.get(input.entityId, input.sourceId);
      if (source.status === "completed") return source;
      if (source.status === "failed") {
        const details = await this.error({
          entityId: input.entityId,
          sourceId: input.sourceId,
        }).catch(() => null);
        throw new Error(
          `Ingestion failed for source ${input.sourceId}${
            details?.latestJob?.error_message
              ? `: ${details.latestJob.error_message}`
              : ""
          }`,
        );
      }

      if (Date.now() - start >= timeoutMs) {
        throw new Error(
          `Timed out waiting for source ${input.sourceId} to complete ingestion`,
        );
      }
      await sleep(intervalMs);
    }
  }
}

class QueryApi {
  constructor(private readonly http: HttpClient) {}

  run(input: QueryInput) {
    return this.http.request<QueryResponse>("/v1/query", {
      method: "POST",
      body: {
        entityId: input.entityId,
        modelConfigId: input.modelConfigId,
        query: input.query,
        topK: input.topK,
        includeParentScopes: input.includeParentScopes,
      },
    });
  }

  runDebug(input: QueryInput) {
    return this.http.request<QueryResponse>("/v1/query/debug", {
      method: "POST",
      body: {
        entityId: input.entityId,
        modelConfigId: input.modelConfigId,
        query: input.query,
        topK: input.topK,
        includeParentScopes: input.includeParentScopes,
      },
    });
  }
}

class ProvidersApi {
  constructor(private readonly http: HttpClient) {}

  async list() {
    const payload = await this.http.request<{ items?: ProviderConnection[] }>(
      "/v1/providers",
    );
    return unwrapItems(payload);
  }

  get(providerId: UUID) {
    return this.http.request<ProviderConnection>(`/v1/providers/${providerId}`);
  }

  create(input: CreateProviderInput) {
    return this.http.request<ProviderConnection>("/v1/providers", {
      method: "POST",
      body: {
        provider: input.provider,
        display_name: input.displayName,
        api_key: input.apiKey,
        entity_id: input.entityId,
        provider_config: input.providerConfig,
      },
    });
  }

  test(providerId: UUID) {
    return this.http.request<{ success: boolean }>(`/v1/providers/${providerId}/test`, {
      method: "POST",
    });
  }

  remove(providerId: UUID) {
    return this.http.request<{ success: boolean }>(`/v1/providers/${providerId}`, {
      method: "DELETE",
    });
  }
}

class ModelsApi {
  constructor(private readonly http: HttpClient) {}

  async listConfigs() {
    const payload = await this.http.request<{ items?: ModelConfig[] }>("/v1/models");
    return unwrapItems(payload);
  }

  async listDefinitions(input?: ListModelDefinitionsInput) {
    const query = input?.type ? `?type=${encodeURIComponent(input.type)}` : "";
    const payload = await this.http.request<{ items?: ModelDefinition[] }>(
      `/v1/model-definitions${query}`,
    );
    return unwrapItems(payload);
  }

  getConfig(modelConfigId: UUID) {
    return this.http.request<ModelConfig>(`/v1/models/${modelConfigId}`);
  }

  createConfig(input: CreateModelConfigInput) {
    return this.http.request<ModelConfig>("/v1/models", {
      method: "POST",
      body: {
        name: input.name,
        llm_model_id: input.llmModelId,
        embedding_model_id: input.embeddingModelId,
        provider_connection_id: input.providerConnectionId,
        llm_provider_connection_id: input.llmProviderConnectionId,
        embedding_provider_connection_id: input.embeddingProviderConnectionId,
        entity_id: input.entityId,
        system_prompt: input.systemPrompt,
        embedding_doc_prefix: input.embeddingDocPrefix,
        embedding_query_prefix: input.embeddingQueryPrefix,
        temperature: input.temperature,
        top_k: input.topK,
        chunk_strategy: input.chunkStrategy,
        chunk_size: input.chunkSize,
        chunk_overlap: input.chunkOverlap,
        is_default: input.isDefault,
      },
    });
  }

  updateConfig(modelConfigId: UUID, input: UpdateModelConfigInput) {
    return this.http.request<ModelConfig>(`/v1/models/${modelConfigId}`, {
      method: "PATCH",
      body: {
        name: input.name,
        llm_model_id: input.llmModelId,
        embedding_model_id: input.embeddingModelId,
        provider_connection_id: input.providerConnectionId,
        llm_provider_connection_id: input.llmProviderConnectionId,
        embedding_provider_connection_id: input.embeddingProviderConnectionId,
        entity_id: input.entityId,
        system_prompt: input.systemPrompt,
        embedding_doc_prefix: input.embeddingDocPrefix,
        embedding_query_prefix: input.embeddingQueryPrefix,
        temperature: input.temperature,
        top_k: input.topK,
        chunk_strategy: input.chunkStrategy,
        chunk_size: input.chunkSize,
        chunk_overlap: input.chunkOverlap,
        is_default: input.isDefault,
      },
    });
  }

  removeConfig(modelConfigId: UUID) {
    return this.http.request<{ success: boolean }>(`/v1/models/${modelConfigId}`, {
      method: "DELETE",
    });
  }
}

export class LayerumClient {
  readonly entities: EntitiesApi;
  readonly entityTypes: EntityTypesApi;
  readonly documents: DocumentsApi;
  readonly ingestion: IngestionApi;
  readonly query: QueryApi;
  readonly providers: ProvidersApi;
  readonly models: ModelsApi;

  constructor(options: LayerumClientOptions) {
    if (typeof options.baseUrl !== "string" || !/^https?:\/\//.test(options.baseUrl)) {
      throw new Error("LayerumClient: baseUrl must be the http(s) URL of your Layerum API");
    }
    const http = new HttpClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs ?? 30_000,
      maxRetries: options.maxRetries ?? 2,
    });
    this.entities = new EntitiesApi(http);
    this.entityTypes = new EntityTypesApi(http);
    this.documents = new DocumentsApi(http);
    this.ingestion = new IngestionApi(http, this.documents);
    this.query = new QueryApi(http);
    this.providers = new ProvidersApi(http);
    this.models = new ModelsApi(http);
  }
}
