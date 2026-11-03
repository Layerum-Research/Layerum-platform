export const VECTOR_STORE_PROVIDERS = ['qdrant', 'lancedb', 'pgvector'] as const;

export type VectorStoreProvider = (typeof VECTOR_STORE_PROVIDERS)[number];

export type VectorPayload = {
  workspace_id: string;
  entity_id: string;
  document_id: string;
  chunk_id: string;
  chunk_index: number;
};

export type VectorPoint = {
  id: string;
  vector: number[];
  payload: VectorPayload;
};

export type VectorSearchFilter = {
  workspaceId: string;
  entityIds: string[];
};

export type VectorSearchHit = {
  id: string;
  score: number;
  payload: VectorPayload;
};

export interface VectorStore {
  readonly provider: VectorStoreProvider;
  init(): Promise<void>;
  listCollections(): Promise<string[]>;
  ensureCollection(name: string, dimension: number): Promise<void>;
  upsert(collection: string, points: VectorPoint[]): Promise<void>;
  search(
    collection: string,
    vector: number[],
    filter: VectorSearchFilter,
    limit: number,
  ): Promise<VectorSearchHit[]>;
  deletePoints(collection: string, ids: string[]): Promise<void>;
  deleteByDocument(
    collection: string,
    workspaceId: string,
    documentId: string,
  ): Promise<void>;
  close(): Promise<void>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}: expected a UUID`);
  }
  return value;
}

const COLLECTION_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

export function assertCollectionName(value: string): string {
  if (!COLLECTION_NAME_PATTERN.test(value)) {
    throw new Error(`Invalid vector collection name: ${value}`);
  }
  return value;
}
