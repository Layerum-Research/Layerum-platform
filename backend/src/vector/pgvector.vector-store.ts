import { Pool, type PoolClient } from 'pg';
import {
  assertCollectionName,
  type VectorPoint,
  type VectorSearchFilter,
  type VectorSearchHit,
  type VectorStore,
} from './vector-store';

const SCHEMA = 'layerum_vectors';
const UPSERT_BATCH_SIZE = 256;
// pgvector cannot build an HNSW index on the vector type above 2000 dimensions.
const MAX_INDEXED_DIMENSION = 2000;

type PgVectorRow = {
  id: string;
  workspace_id: string;
  entity_id: string;
  document_id: string;
  chunk_id: string;
  chunk_index: number;
  distance: number;
};

export class PgVectorStore implements VectorStore {
  readonly provider = 'pgvector' as const;
  private readonly pool: Pool;
  private iterativeScan = false;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
  }

  async init() {
    await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    await this.pool.query(`REVOKE ALL ON SCHEMA ${SCHEMA} FROM PUBLIC`);
    const { rows } = await this.pool.query<{ extversion: string }>(
      "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
    );
    const [major = 0, minor = 0] = (rows[0]?.extversion ?? '0.0')
      .split('.')
      .map(Number);
    this.iterativeScan = major > 0 || minor >= 8;
  }

  async listCollections() {
    const { rows } = await this.pool.query<{ table_name: string }>(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1',
      [SCHEMA],
    );
    return rows.map((row) => row.table_name);
  }

  async ensureCollection(name: string, dimension: number) {
    const table = this.tableName(name);
    if (!Number.isInteger(dimension) || dimension < 1) {
      throw new Error(`Invalid vector dimension: ${dimension}`);
    }
    await this.inTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [table]);
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${table} (
          id uuid PRIMARY KEY,
          workspace_id uuid NOT NULL,
          entity_id uuid NOT NULL,
          document_id uuid NOT NULL,
          chunk_id uuid NOT NULL,
          chunk_index integer NOT NULL,
          embedding vector(${dimension}) NOT NULL
        )`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS ${name}_scope_idx ON ${table} (workspace_id, entity_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS ${name}_document_idx ON ${table} (workspace_id, document_id)`,
      );
      if (dimension <= MAX_INDEXED_DIMENSION) {
        await client.query(
          `CREATE INDEX IF NOT EXISTS ${name}_embedding_idx ON ${table} USING hnsw (embedding vector_cosine_ops)`,
        );
      }
    });
  }

  async upsert(collection: string, points: VectorPoint[]) {
    const table = this.tableName(collection);
    for (let i = 0; i < points.length; i += UPSERT_BATCH_SIZE) {
      const batch = points.slice(i, i + UPSERT_BATCH_SIZE);
      await this.pool.query(
        `INSERT INTO ${table} (id, workspace_id, entity_id, document_id, chunk_id, chunk_index, embedding)
         SELECT id, workspace_id, entity_id, document_id, chunk_id, chunk_index, embedding::vector
         FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::uuid[], $6::integer[], $7::text[])
           AS t(id, workspace_id, entity_id, document_id, chunk_id, chunk_index, embedding)
         ON CONFLICT (id) DO UPDATE SET
           workspace_id = EXCLUDED.workspace_id,
           entity_id = EXCLUDED.entity_id,
           document_id = EXCLUDED.document_id,
           chunk_id = EXCLUDED.chunk_id,
           chunk_index = EXCLUDED.chunk_index,
           embedding = EXCLUDED.embedding`,
        [
          batch.map((p) => p.id),
          batch.map((p) => p.payload.workspace_id),
          batch.map((p) => p.payload.entity_id),
          batch.map((p) => p.payload.document_id),
          batch.map((p) => p.payload.chunk_id),
          batch.map((p) => p.payload.chunk_index),
          batch.map((p) => toVectorLiteral(p.vector)),
        ],
      );
    }
  }

  async search(
    collection: string,
    vector: number[],
    filter: VectorSearchFilter,
    limit: number,
  ): Promise<VectorSearchHit[]> {
    if (filter.entityIds.length === 0) return [];
    const table = this.tableName(collection);
    const rows = await this.inTransaction(async (client) => {
      if (this.iterativeScan) {
        // Without iterative scan an HNSW search with a WHERE filter can return fewer rows than the limit.
        await client.query("SET LOCAL hnsw.iterative_scan = 'relaxed_order'");
      }
      const result = await client.query<PgVectorRow>(
        `WITH hits AS MATERIALIZED (
           SELECT id, workspace_id, entity_id, document_id, chunk_id, chunk_index,
                  embedding <=> $1::vector AS distance
           FROM ${table}
           WHERE workspace_id = $2::uuid AND entity_id = ANY($3::uuid[])
           ORDER BY distance
           LIMIT $4
         )
         SELECT * FROM hits ORDER BY distance`,
        [toVectorLiteral(vector), filter.workspaceId, filter.entityIds, limit],
      );
      return result.rows;
    });
    return rows.map((row) => ({
      id: row.id,
      score: 1 - Number(row.distance),
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
    await this.pool.query(
      `DELETE FROM ${this.tableName(collection)} WHERE id = ANY($1::uuid[])`,
      [ids],
    );
  }

  async deleteByDocument(
    collection: string,
    workspaceId: string,
    documentId: string,
  ) {
    await this.pool.query(
      `DELETE FROM ${this.tableName(collection)} WHERE workspace_id = $1::uuid AND document_id = $2::uuid`,
      [workspaceId, documentId],
    );
  }

  async close() {
    await this.pool.end();
  }

  private tableName(collection: string) {
    return `${SCHEMA}.${assertCollectionName(collection)}`;
  }

  private async inTransaction<T>(run: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function toVectorLiteral(vector: number[]) {
  for (const value of vector) {
    if (!Number.isFinite(value)) {
      throw new Error('Vector contains a non-finite value');
    }
  }
  return `[${vector.join(',')}]`;
}
