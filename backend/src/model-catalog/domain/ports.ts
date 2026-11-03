import type { CatalogModel } from './catalog-model';
import type { CatalogProvider } from './catalog-providers';

export type CatalogSnapshot = {
  etag: string | null;
  models: CatalogModel[];
};

export type CatalogFetchResult =
  | { kind: 'unchanged' }
  | { kind: 'changed'; snapshot: CatalogSnapshot };

export type CatalogSyncSummary = {
  inserted: number;
  updated: number;
  deactivated: number;
};

export abstract class ModelCatalogSource {
  abstract fetch(etag: string | null): Promise<CatalogFetchResult>;
}

export abstract class ModelDefinitionStore {
  abstract getEtag(): Promise<string | null>;
  abstract markChecked(): Promise<void>;
  abstract apply(
    providers: CatalogProvider[],
    snapshot: CatalogSnapshot,
  ): Promise<CatalogSyncSummary>;
}
