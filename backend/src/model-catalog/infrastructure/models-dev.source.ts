import { Injectable } from '@nestjs/common';
import { ModelCatalogSource } from '../domain/ports';
import { parseModelsDevCatalog } from './models-dev.parser';

const MODELS_DEV_URL = 'https://models.dev/api.json';
const REQUEST_TIMEOUT_MS = 30_000;

@Injectable()
export class ModelsDevCatalogSource extends ModelCatalogSource {
  async fetch(etag: string | null) {
    const response = await fetch(MODELS_DEV_URL, {
      headers: etag ? { 'If-None-Match': etag } : {},
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 304) return { kind: 'unchanged' as const };
    if (!response.ok) {
      throw new Error(`models.dev responded with ${response.status}`);
    }

    const payload: unknown = await response.json();
    return {
      kind: 'changed' as const,
      snapshot: {
        etag: response.headers.get('etag'),
        models: parseModelsDevCatalog(payload),
      },
    };
  }
}
