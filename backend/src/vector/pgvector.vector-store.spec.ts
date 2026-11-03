import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PgVectorStore } from './pgvector.vector-store';
import type { VectorPoint } from './vector-store';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('PgVectorStore (needs TEST_DATABASE_URL)', () => {
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();
  const entityA = randomUUID();
  const entityB = randomUUID();
  const documentId = randomUUID();
  const collection = `test_chunks_${randomUUID().replace(/-/g, '').slice(0, 8)}_3`;
  let store: PgVectorStore;

  function point(vector: number[], overrides: Partial<VectorPoint['payload']> = {}): VectorPoint {
    const id = randomUUID();
    return {
      id,
      vector,
      payload: {
        workspace_id: workspaceId,
        entity_id: entityA,
        document_id: documentId,
        chunk_id: id,
        chunk_index: 0,
        ...overrides,
      },
    };
  }

  beforeAll(async () => {
    store = new PgVectorStore(databaseUrl!);
    await store.init();
    await store.ensureCollection(collection, 3);
  });

  afterAll(async () => {
    await store.close();
    const pool = new Pool({ connectionString: databaseUrl });
    await pool.query(`DROP TABLE IF EXISTS layerum_vectors.${collection}`);
    await pool.end();
  });

  it('lists the collection it created', async () => {
    expect(await store.listCollections()).toContain(collection);
  });

  it('returns only points of the requested workspace and entities, best match first', async () => {
    const close = point([1, 0, 0]);
    const far = point([0, 1, 0]);
    await store.upsert(collection, [
      close,
      far,
      point([1, 0, 0], { entity_id: entityB }),
      point([1, 0, 0], { workspace_id: otherWorkspaceId }),
    ]);

    const hits = await store.search(collection, [1, 0, 0], { workspaceId, entityIds: [entityA] }, 10);

    expect(hits.map((hit) => hit.id)).toEqual([close.id, far.id]);
    expect(hits[0].score).toBeCloseTo(1);
    expect(hits[0].payload).toEqual(close.payload);
  });

  it('updates a point when it is upserted again and deletes by id and by document', async () => {
    const otherDocument = randomUUID();
    const kept = point([0, 0, 1], { document_id: otherDocument, entity_id: entityB });
    const removedById = point([0, 1, 1], { document_id: otherDocument, entity_id: entityB });
    await store.upsert(collection, [kept, removedById]);
    await store.upsert(collection, [{ ...kept, vector: [0, 1, 0] }]);

    await store.deletePoints(collection, [removedById.id]);
    await store.deleteByDocument(collection, workspaceId, documentId);

    const hits = await store.search(collection, [0, 1, 0], { workspaceId, entityIds: [entityA, entityB] }, 10);
    expect(hits.map((hit) => hit.id)).toEqual([kept.id]);
    expect(hits[0].score).toBeCloseTo(1);
  });

  it('rejects collection names that are not plain identifiers', async () => {
    await expect(store.deletePoints('chunks; DROP TABLE users', [randomUUID()])).rejects.toThrow(
      'Invalid vector collection name',
    );
  });

  it('keeps the vector schema closed to the API roles', async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const { rows } = await pool.query<{ role: string; usage: boolean }>(
      `SELECT r.rolname AS role, has_schema_privilege(r.rolname, 'layerum_vectors', 'USAGE') AS usage
       FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated')`,
    );
    await pool.end();
    for (const row of rows) expect(row.usage).toBe(false);
  });
});
