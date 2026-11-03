import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LanceDbVectorStore } from './lancedb.vector-store';
import { PgVectorStore } from './pgvector.vector-store';
import { QdrantVectorStore } from './qdrant.vector-store';
import {
  VECTOR_STORE_PROVIDERS,
  type VectorPoint,
  type VectorSearchFilter,
  type VectorSearchHit,
  type VectorStore,
  type VectorStoreProvider,
} from './vector-store';

@Injectable()
export class VectorService implements OnModuleInit, OnModuleDestroy {
  private readonly store: VectorStore;
  private readonly baseCollectionName: string;
  private readonly knownCollections = new Set<string>();
  private readonly gatewayUrl: string;
  private readonly gatewayToken: string;

  constructor(private config: ConfigService) {
    this.baseCollectionName = this.config.get<string>('vector.collectionName')!;
    this.store = this.createStore();
    this.gatewayUrl = (process.env.VECTOR_GATEWAY_URL ?? '').trim().replace(/\/+$/, '');
    this.gatewayToken = (process.env.INTERNAL_GATEWAY_TOKEN ?? '').trim();
  }

  async onModuleInit() {
    if (this.usesGateway()) return;
    await this.store.init();
    await this.refreshCollections();
  }

  async onModuleDestroy() {
    if (this.usesGateway()) return;
    await this.store.close();
  }

  getProvider(): VectorStoreProvider {
    return this.store.provider;
  }

  async upsert(points: VectorPoint[]) {
    if (points.length === 0) {
      throw new BadRequestException('No points to upsert');
    }

    const dimension = points[0].vector.length;
    if (!dimension) {
      throw new BadRequestException('Embedding vector is empty');
    }
    for (const point of points) {
      if (point.vector.length !== dimension) {
        throw new BadRequestException(
          `Vector dimension mismatch inside batch: expected ${dimension}, got ${point.vector.length}`,
        );
      }
    }

    const collectionName = await this.ensureCollectionForDimension(dimension);
    try {
      await this.store.upsert(collectionName, points);
      return { collectionName, dimension };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upsert failed';
      throw new Error(
        `${this.store.provider} upsert failed for collection "${collectionName}" (dimension ${dimension}): ${message}`,
      );
    }
  }

  async search(
    vector: number[],
    filter: VectorSearchFilter,
    topK: number,
  ): Promise<VectorSearchHit[]> {
    const dimension = vector.length;
    if (!dimension) {
      throw new BadRequestException('Query vector is empty');
    }

    if (this.usesGateway()) {
      const res = await this.gatewayRequest<VectorSearchHit[]>('/internal/vector/search', {
        method: 'POST',
        body: JSON.stringify({ vector, filter, topK }),
      });
      return res ?? [];
    }

    const targetCollections = [this.getCollectionNameForDimension(dimension)];
    if (
      dimension === 1536 &&
      this.baseCollectionName !== targetCollections[0]
    ) {
      // Backward compatibility for old data that was written to the legacy base collection.
      targetCollections.push(this.baseCollectionName);
    }

    const existing = await this.getExistingCollections(targetCollections);
    if (existing.length === 0) {
      return [];
    }

    const limit = Math.max(1, topK);
    const merged: VectorSearchHit[] = [];
    for (const collectionName of existing) {
      merged.push(...(await this.store.search(collectionName, vector, filter, limit)));
    }

    return merged.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async deletePoints(collectionName: string, pointIds: string[]) {
    if (pointIds.length === 0) return;
    if (this.usesGateway()) {
      await this.gatewayRequest('/internal/vector/delete-points', {
        method: 'POST',
        body: JSON.stringify({ collectionName, pointIds }),
      });
      return;
    }
    await this.store.deletePoints(collectionName, pointIds);
  }

  async deleteByPayload(
    workspaceId: string,
    documentId: string,
    collectionName?: string,
  ) {
    if (this.usesGateway()) {
      await this.gatewayRequest('/internal/vector/delete-by-payload', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, documentId, collectionName }),
      });
      return;
    }

    const target = collectionName ?? this.baseCollectionName;
    const existing = await this.getExistingCollections([target]);
    if (existing.length === 0) return;
    await this.store.deleteByDocument(target, workspaceId, documentId);
  }

  async getCollections(): Promise<string[]> {
    if (this.usesGateway()) {
      return this.gatewayRequest<string[]>('/internal/vector/collections', {
        method: 'GET',
      });
    }
    return this.store.listCollections();
  }

  getCollectionName() {
    return this.baseCollectionName;
  }

  getCollectionNameForDimension(dimension: number) {
    return `${this.baseCollectionName}_${dimension}`;
  }

  private createStore(): VectorStore {
    const provider = this.config.get<string>('vector.store') ?? 'qdrant';
    if (!VECTOR_STORE_PROVIDERS.includes(provider as VectorStoreProvider)) {
      throw new Error(
        `VECTOR_STORE must be one of ${VECTOR_STORE_PROVIDERS.join(', ')}, got "${provider}"`,
      );
    }
    switch (provider as VectorStoreProvider) {
      case 'qdrant':
        return new QdrantVectorStore({
          url: this.config.get<string>('vector.qdrant.url')!,
          apiKey: this.config.get<string>('vector.qdrant.apiKey'),
        });
      case 'lancedb':
        return new LanceDbVectorStore(this.config.get<string>('vector.lancedb.uri')!);
      case 'pgvector': {
        const databaseUrl = this.config.get<string>('vector.pgvector.databaseUrl');
        if (!databaseUrl) {
          throw new Error('DATABASE_URL is required when VECTOR_STORE=pgvector');
        }
        return new PgVectorStore(databaseUrl);
      }
    }
  }

  private async ensureCollectionForDimension(dimension: number) {
    const collectionName = this.getCollectionNameForDimension(dimension);
    if (this.knownCollections.has(collectionName)) return collectionName;
    await this.store.ensureCollection(collectionName, dimension);
    this.knownCollections.add(collectionName);
    return collectionName;
  }

  private async refreshCollections() {
    try {
      const collections = await this.store.listCollections();
      this.knownCollections.clear();
      for (const name of collections) {
        this.knownCollections.add(name);
      }
    } catch {}
  }

  private async getExistingCollections(collectionNames: string[]) {
    await this.refreshCollections();
    return collectionNames.filter((name) => this.knownCollections.has(name));
  }

  private usesGateway() {
    return Boolean(this.gatewayUrl);
  }

  private async gatewayRequest<T = unknown>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: string },
  ): Promise<T> {
    if (!this.gatewayUrl) {
      throw new Error('VECTOR_GATEWAY_URL is not configured');
    }
    if (!this.gatewayToken) {
      throw new Error('INTERNAL_GATEWAY_TOKEN is required for vector gateway mode');
    }

    const res = await fetch(`${this.gatewayUrl}${path}`, {
      method: init.method,
      headers: {
        'content-type': 'application/json',
        'x-internal-token': this.gatewayToken,
      },
      body: init.body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Vector gateway request failed (${res.status}): ${text}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
