import { Injectable, Logger } from '@nestjs/common';
import { CATALOG_PROVIDERS } from './domain/catalog-providers';
import { ModelCatalogSource, ModelDefinitionStore } from './domain/ports';

@Injectable()
export class ModelCatalogSyncService {
  private readonly logger = new Logger(ModelCatalogSyncService.name);

  constructor(
    private readonly source: ModelCatalogSource,
    private readonly store: ModelDefinitionStore,
  ) {}

  async sync() {
    try {
      const result = await this.source.fetch(await this.store.getEtag());
      if (result.kind === 'unchanged') {
        await this.store.markChecked();
        return;
      }
      if (result.snapshot.models.length === 0) {
        throw new Error('models.dev catalog returned no supported models');
      }

      const summary = await this.store.apply(
        CATALOG_PROVIDERS,
        result.snapshot,
      );
      this.logger.log(
        `Model catalog synced: ${summary.inserted} inserted, ${summary.updated} updated, ${summary.deactivated} deactivated`,
      );
    } catch (error) {
      this.logger.warn(
        `Model catalog sync failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
