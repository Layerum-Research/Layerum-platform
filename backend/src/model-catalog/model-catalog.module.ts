import { Module } from '@nestjs/common';
import { ModelCatalogSyncService } from './model-catalog-sync.service';
import { ModelCatalogSource, ModelDefinitionStore } from './domain/ports';
import { ModelsDevCatalogSource } from './infrastructure/models-dev.source';
import { SupabaseModelDefinitionStore } from './infrastructure/supabase-model-definition.store';

@Module({
  providers: [
    { provide: ModelCatalogSource, useClass: ModelsDevCatalogSource },
    { provide: ModelDefinitionStore, useClass: SupabaseModelDefinitionStore },
    ModelCatalogSyncService,
  ],
  exports: [ModelCatalogSyncService],
})
export class ModelCatalogModule {}
