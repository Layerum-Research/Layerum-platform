import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { AwsKmsProvider } from './providers/aws-kms.provider';
import { LocalVaultProvider } from './providers/local-vault.provider';
import type { KeyProvider } from './providers/key-provider.interface';
import type { KeyProviderKind, WorkspaceDek, WrappedDek } from './types';

type CacheEntry = {
  expiresAt: number;
  dek: WorkspaceDek;
};

type WorkspaceEncryptionKeyRow = {
  workspace_id: string;
  dek_version: number;
  provider: KeyProviderKind;
  encrypted_dek: string;
  dek_iv: string | null;
  dek_tag: string | null;
  kms_key_id: string | null;
  status: 'active' | 'retired';
};

@Injectable()
export class KeyManagementService {
  private readonly logger = new Logger(KeyManagementService.name);
  private readonly provider: KeyProvider;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly activeDekInFlight = new Map<string, Promise<WorkspaceDek>>();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    awsKmsProvider: AwsKmsProvider,
    localVaultProvider: LocalVaultProvider,
  ) {
    const providerMode =
      (this.config.get<string>('workspaceEncryption.provider') ??
        'local_vault') as KeyProviderKind;

    this.provider =
      providerMode === 'aws_kms' ? awsKmsProvider : localVaultProvider;

    this.cacheTtlMs = Number(
      this.config.get<string>('workspaceEncryption.cacheTtlMs') ?? '300000',
    );
  }

  async getWorkspaceDek(workspaceId: string, version?: number): Promise<WorkspaceDek> {
    if (version) {
      return this.getWorkspaceDekByVersion(workspaceId, version);
    }

    const inflight = this.activeDekInFlight.get(workspaceId);
    if (inflight) {
      return inflight;
    }

    const loadingPromise = this.getActiveWorkspaceDek(workspaceId);
    this.activeDekInFlight.set(workspaceId, loadingPromise);

    try {
      return await loadingPromise;
    } finally {
      if (this.activeDekInFlight.get(workspaceId) === loadingPromise) {
        this.activeDekInFlight.delete(workspaceId);
      }
    }
  }

  private async getActiveWorkspaceDek(workspaceId: string): Promise<WorkspaceDek> {
    const resolvedVersion = await this.findActiveVersion(workspaceId);
    return this.getWorkspaceDekByVersion(workspaceId, resolvedVersion);
  }

  private async getWorkspaceDekByVersion(
    workspaceId: string,
    resolvedVersion: number,
  ): Promise<WorkspaceDek> {
    const cacheKey = `${workspaceId}:${resolvedVersion}`;
    const now = Date.now();

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.dek;
    }

    const row = await this.getKeyRow(workspaceId, resolvedVersion);
    const key = await this.unwrapRow(row);

    const dek: WorkspaceDek = {
      workspaceId,
      version: row.dek_version,
      key,
    };

    this.cache.set(cacheKey, {
      expiresAt: now + this.cacheTtlMs,
      dek,
    });

    return dek;
  }

  private async findActiveVersion(workspaceId: string): Promise<number> {
    const active = await this.selectActiveKeyRow(workspaceId);
    if (active?.dek_version) {
      return active.dek_version;
    }

    const created = await this.createInitialKey(workspaceId);
    return created.dek_version;
  }

  private async createInitialKey(workspaceId: string) {
    const generated = await this.provider.generateWrappedDek(workspaceId);

    const { data, error } = await this.supabase.admin
      .from('workspace_encryption_keys')
      .insert({
        workspace_id: workspaceId,
        dek_version: 1,
        provider: generated.wrapped.provider,
        encrypted_dek: generated.wrapped.encryptedDek,
        dek_iv: generated.wrapped.iv,
        dek_tag: generated.wrapped.tag,
        kms_key_id: generated.wrapped.kmsKeyId,
        status: 'active',
      })
      .select(
        'workspace_id, dek_version, provider, encrypted_dek, dek_iv, dek_tag, kms_key_id, status',
      )
      .single<WorkspaceEncryptionKeyRow>();

    if (error) {
      if (this.isDuplicateError(error)) {
        this.logger.warn(
          JSON.stringify({
            event: 'workspace_encryption_key_duplicate_fallback',
            workspaceId,
          }),
        );

        const active = await this.selectActiveKeyRow(workspaceId);
        if (active) {
          return active;
        }

        throw new Error(
          'Duplicate key insert conflict but no active workspace encryption key found',
        );
      }

      throw new Error(error?.message ?? 'Failed to create workspace encryption key');
    }
    if (!data) {
      throw new Error('Failed to create workspace encryption key');
    }

    const cacheKey = `${workspaceId}:${data.dek_version}`;
    this.cache.set(cacheKey, {
      expiresAt: Date.now() + this.cacheTtlMs,
      dek: {
        workspaceId,
        version: data.dek_version,
        key: generated.plaintextDek,
      },
    });

    return data;
  }

  private async selectActiveKeyRow(
    workspaceId: string,
  ): Promise<WorkspaceEncryptionKeyRow | null> {
    const { data, error } = await this.supabase.admin
      .from('workspace_encryption_keys')
      .select(
        'workspace_id, dek_version, provider, encrypted_dek, dek_iv, dek_tag, kms_key_id, status',
      )
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('dek_version', { ascending: false })
      .limit(1)
      .maybeSingle<WorkspaceEncryptionKeyRow>();

    if (error) {
      throw new Error(error.message);
    }

    return data ?? null;
  }

  private isDuplicateError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    if (!('code' in error)) return false;
    return (error as { code?: string }).code === '23505';
  }

  private async getKeyRow(workspaceId: string, version: number) {
    const { data, error } = await this.supabase.admin
      .from('workspace_encryption_keys')
      .select(
        'workspace_id, dek_version, provider, encrypted_dek, dek_iv, dek_tag, kms_key_id, status',
      )
      .eq('workspace_id', workspaceId)
      .eq('dek_version', version)
      .single<WorkspaceEncryptionKeyRow>();

    if (error || !data) {
      throw new Error('Workspace encryption key not found');
    }

    return data;
  }

  private async unwrapRow(row: WorkspaceEncryptionKeyRow) {
    const wrapped: WrappedDek = {
      provider: row.provider,
      encryptedDek: row.encrypted_dek,
      iv: row.dek_iv,
      tag: row.dek_tag,
      kmsKeyId: row.kms_key_id,
    };

    if (wrapped.provider === this.provider.kind) {
      return this.provider.unwrapDek(wrapped);
    }

    const provider = this.resolveProvider(wrapped.provider);
    return provider.unwrapDek(wrapped);
  }

  private resolveProvider(kind: KeyProviderKind): KeyProvider {
    if (kind === 'aws_kms') {
      if (this.provider.kind === 'aws_kms') return this.provider;
      throw new Error('aws_kms row requires aws_kms provider mode');
    }
    if (kind === 'local_vault') {
      if (this.provider.kind === 'local_vault') return this.provider;
      throw new Error('local_vault row requires local_vault provider mode');
    }
    throw new Error(`Unsupported key provider: ${kind}`);
  }
}
