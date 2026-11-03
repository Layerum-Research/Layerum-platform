import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantVectorStore } from './qdrant.vector-store';

jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn(),
}));

describe('QdrantVectorStore.ensureCollection', () => {
  const createCollection = jest.fn();

  beforeEach(() => {
    createCollection.mockReset();
    (QdrantClient as unknown as jest.Mock).mockImplementation(() => ({ createCollection }));
  });

  function apiError(status: number, message: string) {
    return Object.assign(new Error(message), { status });
  }

  it('creates the collection', async () => {
    createCollection.mockResolvedValue(true);
    await new QdrantVectorStore({ url: 'http://qdrant:6333' }).ensureCollection('docs', 3);
    expect(createCollection).toHaveBeenCalledWith('docs', {
      vectors: { size: 3, distance: 'Cosine' },
    });
  });

  it('ignores a 409 from a collection created concurrently', async () => {
    createCollection.mockRejectedValue(apiError(409, 'Conflict'));
    await expect(
      new QdrantVectorStore({ url: 'http://qdrant:6333' }).ensureCollection('docs', 3),
    ).resolves.toBeUndefined();
  });

  it('rethrows other errors', async () => {
    createCollection.mockRejectedValue(apiError(500, 'Internal Server Error'));
    await expect(
      new QdrantVectorStore({ url: 'http://qdrant:6333' }).ensureCollection('docs', 3),
    ).rejects.toThrow('Internal Server Error');
  });
});
