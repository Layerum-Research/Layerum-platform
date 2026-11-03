import { QdrantClient } from '@qdrant/js-client-rest';
import type {
  VectorPayload,
  VectorPoint,
  VectorSearchFilter,
  VectorSearchHit,
  VectorStore,
} from './vector-store';

const UPSERT_BATCH_SIZE = 256;

export class QdrantVectorStore implements VectorStore {
  readonly provider = 'qdrant' as const;
  private readonly client: QdrantClient;

  constructor(options: { url: string; apiKey?: string }) {
    this.client = new QdrantClient({
      url: options.url,
      apiKey: options.apiKey || undefined,
    });
  }

  async init() {}

  async listCollections() {
    const { collections } = await this.client.getCollections();
    return collections.map((collection) => collection.name);
  }

  async ensureCollection(name: string, dimension: number) {
    try {
      await this.client.createCollection(name, {
        vectors: { size: dimension, distance: 'Cosine' },
      });
    } catch (error) {
      const status = (error as { status?: unknown } | null)?.status;
      const message = error instanceof Error ? error.message : '';
      if (status !== 409 && !/already exists|exist/i.test(message)) throw error;
    }
  }

  async upsert(collection: string, points: VectorPoint[]) {
    for (let i = 0; i < points.length; i += UPSERT_BATCH_SIZE) {
      await this.client.upsert(collection, {
        points: points.slice(i, i + UPSERT_BATCH_SIZE).map((point) => ({
          id: point.id,
          vector: point.vector,
          payload: point.payload,
        })),
      });
    }
  }

  async search(
    collection: string,
    vector: number[],
    filter: VectorSearchFilter,
    limit: number,
  ): Promise<VectorSearchHit[]> {
    const result = await this.client.search(collection, {
      vector,
      filter: {
        must: [
          { key: 'workspace_id', match: { value: filter.workspaceId } },
          { key: 'entity_id', match: { any: filter.entityIds } },
        ],
      },
      limit,
      with_payload: true,
    });
    return result.map((hit) => ({
      id: String(hit.id),
      score: hit.score,
      payload: hit.payload as unknown as VectorPayload,
    }));
  }

  async deletePoints(collection: string, ids: string[]) {
    await this.client.delete(collection, { points: ids });
  }

  async deleteByDocument(
    collection: string,
    workspaceId: string,
    documentId: string,
  ) {
    await this.client.delete(collection, {
      filter: {
        must: [
          { key: 'workspace_id', match: { value: workspaceId } },
          { key: 'document_id', match: { value: documentId } },
        ],
      },
    });
  }

  async close() {}
}
