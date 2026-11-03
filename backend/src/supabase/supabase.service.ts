import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

@Injectable()
export class SupabaseService {
  readonly admin: SupabaseClient<Database>;
  readonly anon: SupabaseClient<Database>;
  private readonly internalUrl: string;
  private readonly publicUrl: string;

  constructor(private config: ConfigService) {
    this.internalUrl = this.config.get<string>('supabase.url') ?? '';
    this.publicUrl =
      this.config.get<string>('supabase.publicUrl') || this.internalUrl;
    this.admin = createClient<Database>(
      this.config.get<string>('supabase.url')!,
      this.config.get<string>('supabase.serviceRoleKey')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    this.anon = createClient<Database>(
      this.config.get<string>('supabase.url')!,
      this.config.get<string>('supabase.anonKey')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  async uploadObject(
    bucket: string,
    objectKey: string,
    body: Buffer,
    contentType: string,
  ) {
    const { error } = await this.admin.storage
      .from(bucket)
      .upload(objectKey, body, {
        contentType,
        upsert: true,
      });
    if (error) throw new Error(error.message);
  }

  async removeObjects(bucket: string, objectKeys: string[]) {
    const keys = [
      ...new Set(objectKeys.filter((value) => Boolean(value?.trim()))),
    ];
    if (keys.length === 0) return;

    const { error } = await this.admin.storage.from(bucket).remove(keys);
    if (error) throw new Error(error.message);
  }

  async createSignedUrl(
    bucket: string,
    objectKey: string,
    expiresInSeconds = 3600,
  ) {
    if (!objectKey || /^https?:\/\//i.test(objectKey)) return objectKey;

    const { data, error } = await this.admin.storage
      .from(bucket)
      .createSignedUrl(objectKey, expiresInSeconds);

    if (error) return null;
    return data?.signedUrl ? this.toPublicUrl(data.signedUrl) : null;
  }

  getPublicUrl(bucket: string, objectKey: string) {
    if (!objectKey) return null;
    if (/^https?:\/\//i.test(objectKey)) return objectKey;

    const { data } = this.admin.storage.from(bucket).getPublicUrl(objectKey);
    return data.publicUrl ? this.toPublicUrl(data.publicUrl) : null;
  }

  private toPublicUrl(url: string) {
    const internal = this.internalUrl.replace(/\/+$/, '');
    const external = this.publicUrl.replace(/\/+$/, '');
    if (!internal || internal === external || !url.startsWith(internal)) {
      return url;
    }
    return external + url.slice(internal.length);
  }
}
