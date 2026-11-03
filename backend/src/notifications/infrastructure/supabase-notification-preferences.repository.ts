import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { NotificationPreferencesRepository } from '../domain/ports';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '../domain/notification-preferences';

const COLUMNS =
  'user_id, system_health_in_app, system_health_email, api_usage_in_app, api_usage_email';

type PreferencesRow = NotificationPreferences & { user_id: string };

function toPreferences(row: PreferencesRow): NotificationPreferences {
  return {
    system_health_in_app: row.system_health_in_app,
    system_health_email: row.system_health_email,
    api_usage_in_app: row.api_usage_in_app,
    api_usage_email: row.api_usage_email,
  };
}

@Injectable()
export class SupabaseNotificationPreferencesRepository extends NotificationPreferencesRepository {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async get(userId: string) {
    const preferences = await this.getMany([userId]);
    return preferences.get(userId) ?? DEFAULT_NOTIFICATION_PREFERENCES;
  }

  async getMany(userIds: string[]) {
    if (userIds.length === 0) {
      return new Map<string, NotificationPreferences>();
    }
    const { data, error } = await this.supabase.admin
      .from('notification_preferences')
      .select(COLUMNS)
      .in('user_id', userIds)
      .returns<PreferencesRow[]>();
    if (error) throw new Error(error.message);
    return new Map(
      (data ?? []).map((row) => [row.user_id, toPreferences(row)]),
    );
  }

  async update(userId: string, changes: Partial<NotificationPreferences>) {
    const { data, error } = await this.supabase.admin
      .from('notification_preferences')
      .upsert(
        { user_id: userId, ...changes, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      .select(COLUMNS)
      .single<PreferencesRow>();
    if (error) throw new Error(error.message);
    return toPreferences(data);
  }
}
