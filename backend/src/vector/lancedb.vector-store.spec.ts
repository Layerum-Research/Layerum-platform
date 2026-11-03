import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LanceDbVectorStore } from './lancedb.vector-store';
import type { VectorPoint } from './vector-store';

describe('LanceDbVectorStore', () => {
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();
  const entityA = randomUUID();
  const entityB = randomUUID();
  const documentId = randomUUID();
  let dir: string;
  let store: LanceDbVectorStore;

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

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'layerum-lancedb-'));
    store = new LanceDbVectorStore(dir);
    await store.init();
    await store.ensureCollection('chunks_3', 3);
  });

  afterEach(async () => {
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns only points of the requested workspace and entities, best match first', async () => {
    const close = point([1, 0, 0]);
    const far = point([0, 1, 0]);
    const otherEntity = point([1, 0, 0], { entity_id: entityB });
    const otherWorkspace = point([1, 0, 0], { workspace_id: otherWorkspaceId });
    await store.upsert('chunks_3', [close, far, otherEntity, otherWorkspace]);

    const hits = await store.search(
      'chunks_3',
      [1, 0, 0],
      { workspaceId, entityIds: [entityA] },
      10,
    );

    expect(hits.map((hit) => hit.id)).toEqual([close.id, far.id]);
    expect(hits[0].score).toBeCloseTo(1);
    expect(hits[0].payload.chunk_id).toBe(close.payload.chunk_id);
  });

  it('updates a point when it is upserted again', async () => {
    const original = point([1, 0, 0]);
    await store.upsert('chunks_3', [original]);
    await store.upsert('chunks_3', [{ ...original, vector: [0, 0, 1] }]);

    const hits = await store.search('chunks_3', [0, 0, 1], { workspaceId, entityIds: [entityA] }, 10);

    expect(hits).toHaveLength(1);
    expect(hits[0].score).toBeCloseTo(1);
  });

  it('deletes points by id and by document', async () => {
    const first = point([1, 0, 0]);
    const second = point([0, 1, 0], { document_id: randomUUID() });
    const third = point([0, 0, 1]);
    await store.upsert('chunks_3', [first, second, third]);

    await store.deletePoints('chunks_3', [first.id]);
    await store.deleteByDocument('chunks_3', workspaceId, documentId);

    const hits = await store.search('chunks_3', [1, 1, 1], { workspaceId, entityIds: [entityA] }, 10);
    expect(hits.map((hit) => hit.id)).toEqual([second.id]);
  });

  it('rejects ids that are not UUIDs instead of building a filter from them', async () => {
    await expect(
      store.search('chunks_3', [1, 0, 0], { workspaceId: "x' OR '1'='1", entityIds: [entityA] }, 10),
    ).rejects.toThrow('Invalid workspace id');
  });

  it('sees rows written by another connection to the same database', async () => {
    const writer = new LanceDbVectorStore(dir);
    await writer.init();
    await store.search('chunks_3', [1, 0, 0], { workspaceId, entityIds: [entityA] }, 10);
    const written = point([1, 0, 0]);
    await writer.upsert('chunks_3', [written]);
    await writer.close();

    const hits = await store.search('chunks_3', [1, 0, 0], { workspaceId, entityIds: [entityA] }, 10);
    expect(hits.map((hit) => hit.id)).toEqual([written.id]);
  });
});
