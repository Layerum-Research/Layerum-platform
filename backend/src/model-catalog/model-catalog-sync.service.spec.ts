import { ModelCatalogSyncService } from './model-catalog-sync.service';
import { CATALOG_PROVIDERS } from './domain/catalog-providers';
import type { CatalogModel } from './domain/catalog-model';
import {
  ModelCatalogSource,
  ModelDefinitionStore,
  type CatalogFetchResult,
} from './domain/ports';

const model: CatalogModel = {
  provider: 'openai',
  providerKey: 'gpt-6-sol',
  displayName: 'GPT-6 Sol',
  modelType: 'llm',
  family: 'gpt',
  contextWindow: 400000,
  maxOutput: 128000,
  capabilities: ['chat'],
  pricing: null,
  releaseDate: '2026-09-22',
  status: null,
};

function setup(result: CatalogFetchResult | Error) {
  const fetch = jest.fn<Promise<CatalogFetchResult>, [string | null]>(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  const store = {
    getEtag: jest.fn().mockResolvedValue('"etag-1"'),
    markChecked: jest.fn().mockResolvedValue(undefined),
    apply: jest
      .fn()
      .mockResolvedValue({ inserted: 1, updated: 0, deactivated: 0 }),
  };
  const service = new ModelCatalogSyncService(
    { fetch } as ModelCatalogSource,
    store as ModelDefinitionStore,
  );
  return { service, fetch, store };
}

describe('ModelCatalogSyncService', () => {
  it('only records the check when the catalog is unchanged', async () => {
    const { service, fetch, store } = setup({ kind: 'unchanged' });

    await service.sync();

    expect(fetch).toHaveBeenCalledWith('"etag-1"');
    expect(store.markChecked).toHaveBeenCalled();
    expect(store.apply).not.toHaveBeenCalled();
  });

  it('applies a changed snapshot for all supported providers', async () => {
    const snapshot = { etag: '"etag-2"', models: [model] };
    const { service, store } = setup({ kind: 'changed', snapshot });

    await service.sync();

    expect(store.apply).toHaveBeenCalledWith(CATALOG_PROVIDERS, snapshot);
  });

  it('never applies an empty snapshot', async () => {
    const { service, store } = setup({
      kind: 'changed',
      snapshot: { etag: '"etag-2"', models: [] },
    });

    await service.sync();

    expect(store.apply).not.toHaveBeenCalled();
  });

  it('does not throw when the source fails', async () => {
    const { service, store } = setup(new Error('network down'));

    await expect(service.sync()).resolves.toBeUndefined();
    expect(store.apply).not.toHaveBeenCalled();
  });
});
