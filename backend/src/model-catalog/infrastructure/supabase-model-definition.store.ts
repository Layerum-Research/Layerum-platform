import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import type { CatalogModel } from '../domain/catalog-model';
import type { CatalogProvider } from '../domain/catalog-providers';
import { ModelDefinitionStore, type CatalogSnapshot } from '../domain/ports';

const SYNC_SOURCE = 'models.dev';

function toRow(model: CatalogModel) {
  const row = {
    provider: model.provider,
    provider_key: model.providerKey,
    display_name: model.displayName,
    model_type: model.modelType,
    family: model.family,
    context_window: model.contextWindow,
    max_output: model.maxOutput,
    capabilities: model.capabilities,
    pricing: model.pricing && {
      input: model.pricing.input,
      output: model.pricing.output,
      cache_read: model.pricing.cacheRead,
    },
    release_date: model.releaseDate,
    catalog_status: model.status,
  };
  const catalog_hash = createHash('sha256')
    .update(JSON.stringify(row))
    .digest('hex');
  return { ...row, catalog_hash };
}

@Injectable()
export class SupabaseModelDefinitionStore extends ModelDefinitionStore {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async getEtag() {
    const { data, error } = await this.supabase.admin
      .from('model_catalog_sync_state')
      .select('etag')
      .eq('source', SYNC_SOURCE)
      .maybeSingle<{ etag: string | null }>();
    if (error) throw new Error(error.message);
    return data?.etag ?? null;
  }

  async markChecked() {
    await this.saveState({ checked_at: new Date().toISOString() });
  }

  async apply(providers: CatalogProvider[], snapshot: CatalogSnapshot) {
    const { data, error } = await this.supabase.admin.rpc(
      'sync_model_definitions',
      { p_providers: providers, p_rows: snapshot.models.map(toRow) },
    );
    if (error) throw new Error(error.message);

    const now = new Date().toISOString();
    await this.saveState({
      etag: snapshot.etag,
      synced_at: now,
      checked_at: now,
    });

    const [summary] = data ?? [];
    return summary ?? { inserted: 0, updated: 0, deactivated: 0 };
  }

  private async saveState(state: {
    etag?: string | null;
    synced_at?: string;
    checked_at: string;
  }) {
    const { error } = await this.supabase.admin
      .from('model_catalog_sync_state')
      .upsert({ source: SYNC_SOURCE, ...state }, { onConflict: 'source' });
    if (error) throw new Error(error.message);
  }
}
