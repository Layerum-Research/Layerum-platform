import * as lancedb from '@lancedb/lancedb';
import {
  Field,
  FixedSizeList,
  Float32,
  Int32,
  Schema,
  Utf8,
} from 'apache-arrow';
import {
  assertUuid,
  type VectorPayload,
  type VectorPoint,
  type VectorSearchFilter,
  type VectorSearchHit,
  type VectorStore,
} from './vector-store';

type LanceRow = VectorPayload & { id: string; vector: number[] };

export class LanceDbVectorStore implements VectorStore {
  readonly provider = 'lancedb' as const;
  private connection: lancedb.Connection | null = null;
  private readonly tables = new Map<string, lancedb.Table>();

  constructor(private readonly uri: string) {}

  async init() {
    // Reads must see rows written by other processes (API reads what the worker writes).
    this.connection = await lancedb.connect(this.uri, {
      readConsistencyInterval: 0,
    });
  }

  async listCollections() {
    return this.getConnection().tableNames();
  }

  async ensureCollection(name: string, dimension: number) {
    if (this.tables.has(name)) return;
    const schema = new Schema([
      new Field('id', new Utf8(), false),
      new Field(
        'vector',
        new FixedSizeList(dimension, new Field('item', new Float32(), true)),
        false,
      ),
      new Field('workspace_id', new Utf8(), false),
      new Field('entity_id', new Utf8(), false),
      new Field('document_id', new Utf8(), false),
      new Field('chunk_id', new Utf8(), false),
      new Field('chunk_index', new Int32(), false),
    ]);
    const table = await this.getConnection().createEmptyTable(name, schema, {
      mode: 'exist_ok',
    });
    this.tables.set(name, table);
  }

  async upsert(collection: string, points: VectorPoint[]) {
    const rows: LanceRow[] = points.map((point) => ({
      id: assertUuid(point.id, 'point id'),
      vector: point.vector,
      workspace_id: point.payload.workspace_id,
      entity_id: point.payload.entity_id,
      document_id: point.payload.document_id,
      chunk_id: point.payload.chunk_id,
      chunk_index: point.payload.chunk_index,
    }));
    const table = await this.openTable(collection);
    await table
      .mergeInsert('id')
      .whenMatchedUpdateAll()
      .whenNotMatchedInsertAll()
      .execute(rows);
  }

  async search(
    collection: string,
    vector: number[],
    filter: VectorSearchFilter,
    limit: number,
  ): Promise<VectorSearchHit[]> {
    if (filter.entityIds.length === 0) return [];
    const workspaceId = assertUuid(filter.workspaceId, 'workspace id');
    const entityIds = filter.entityIds
      .map((id) => `'${assertUuid(id, 'entity id')}'`)
      .join(', ');
    const table = await this.openTable(collection);
    const rows = (await table
      .vectorSearch(vector)
      .distanceType('cosine')
      .where(`workspace_id = '${workspaceId}' AND entity_id IN (${entityIds})`)
      .limit(limit)
      .toArray()) as Array<LanceRow & { _distance: number }>;
    return rows.map((row) => ({
      id: row.id,
      score: 1 - row._distance,
      payload: {
        workspace_id: row.workspace_id,
        entity_id: row.entity_id,
        document_id: row.document_id,
        chunk_id: row.chunk_id,
        chunk_index: row.chunk_index,
      },
    }));
  }

  async deletePoints(collection: string, ids: string[]) {
    const list = ids.map((id) => `'${assertUuid(id, 'point id')}'`).join(', ');
    const table = await this.openTable(collection);
    await table.delete(`id IN (${list})`);
  }

  async deleteByDocument(
    collection: string,
    workspaceId: string,
    documentId: string,
  ) {
    const table = await this.openTable(collection);
    await table.delete(
      `workspace_id = '${assertUuid(workspaceId, 'workspace id')}' AND document_id = '${assertUuid(documentId, 'document id')}'`,
    );
  }

  async close() {
    for (const table of this.tables.values()) table.close();
    this.tables.clear();
    this.connection?.close();
    this.connection = null;
  }

  private async openTable(name: string) {
    const cached = this.tables.get(name);
    if (cached) return cached;
    const table = await this.getConnection().openTable(name);
    this.tables.set(name, table);
    return table;
  }

  private getConnection() {
    if (!this.connection) {
      throw new Error('LanceDB connection is not initialized');
    }
    return this.connection;
  }
}
