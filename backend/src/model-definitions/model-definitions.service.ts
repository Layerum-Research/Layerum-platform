import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ModelDefinitionsService {
  constructor(private supabase: SupabaseService) {}

  async findAll(modelType?: string) {
    let query = this.supabase.admin
      .from('model_definitions')
      .select('*')
      .eq('is_active', true)
      .order('provider')
      .order('release_date', { ascending: false, nullsFirst: false })
      .order('display_name');

    if (modelType) {
      query = query.eq('model_type', modelType);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }
}
