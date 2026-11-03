import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CryptoService } from '../crypto/crypto.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { AuditService } from '../audit/audit.service';
import { normalizeSafeOutboundBaseUrl } from '../common/security/outbound-url-policy';

type ProviderConnectionRow = {
  id: string;
  workspace_id: string;
  entity_id: string | null;
  provider: string;
  display_name: string;
  key_preview: string | null;
  provider_config: Record<string, unknown> | null;
  is_active: boolean;
  last_tested_at: string | null;
  test_passed: boolean | null;
  created_at: string;
};

type ProviderConnectionKeyRow = {
  encrypted_key: string;
  key_iv: string;
  key_tag: string;
};

@Injectable()
export class ProviderConnectionsService {
  constructor(
    private supabase: SupabaseService,
    private crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async create(workspaceId: string, userId: string, dto: CreateProviderDto) {
    try {
      const providerConfig = await this.normalizeProviderConfig(
        dto.provider_config,
        dto.provider,
      );
      const { encrypted, iv, tag } = this.crypto.encrypt(dto.api_key);
      const preview = this.crypto.keyPreview(dto.api_key);

      const { data, error } = await this.supabase.admin
        .from('provider_connections')
        .insert({
          workspace_id: workspaceId,
          entity_id: dto.entity_id ?? null,
          provider: dto.provider,
          display_name: dto.display_name,
          encrypted_key: encrypted,
          key_iv: iv,
          key_tag: tag,
          key_preview: preview,
          provider_config: providerConfig,
          created_by: userId,
        })
        .select(
          'id, workspace_id, entity_id, provider, display_name, key_preview, provider_config, is_active, last_tested_at, test_passed, created_at',
        )
        .single<ProviderConnectionRow>();

      if (error) throw new Error(error.message);
      await this.safeAudit({
        workspaceId,
        userId,
        action: 'create',
        resource: 'provider_connection',
        resourceId: data.id,
        metadata: { provider: dto.provider, displayName: dto.display_name },
      });
      return data;
    } catch (error) {
      await this.safeAudit({
        workspaceId,
        userId,
        action: 'create',
        resource: 'provider_connection',
        success: false,
        errorCode: this.errorCode(error),
        metadata: { provider: dto.provider, displayName: dto.display_name },
      });
      throw error;
    }
  }

  async findAll(workspaceId: string) {
    const { data, error } = await this.supabase.admin
      .from('provider_connections')
      .select(
        'id, workspace_id, entity_id, provider, display_name, key_preview, provider_config, is_active, last_tested_at, test_passed, created_at',
      )
      .eq('workspace_id', workspaceId)
      .order('created_at')
      .returns<ProviderConnectionRow[]>();

    if (error) throw new Error(error.message);
    return data;
  }

  async findOne(workspaceId: string, id: string) {
    const { data, error } = await this.supabase.admin
      .from('provider_connections')
      .select(
        'id, workspace_id, entity_id, provider, display_name, key_preview, provider_config, is_active, last_tested_at, test_passed, created_at',
      )
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single<ProviderConnectionRow>();

    if (error || !data)
      throw new NotFoundException('Provider connection not found');
    return data;
  }

  async getDecryptedKey(workspaceId: string, id: string): Promise<string> {
    const { data, error } = await this.supabase.admin
      .from('provider_connections')
      .select('encrypted_key, key_iv, key_tag')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single<ProviderConnectionKeyRow>();

    if (error || !data)
      throw new NotFoundException('Provider connection not found');
    return this.crypto.decrypt(data.encrypted_key, data.key_iv, data.key_tag);
  }

  async getRuntimeConnection(
    workspaceId: string,
    id: string,
  ): Promise<{
    id: string;
    provider: string;
    provider_config: Record<string, unknown> | null;
    api_key: string;
  }> {
    const { data, error } = await this.supabase.admin
      .from('provider_connections')
      .select(
        'id, provider, provider_config, is_active, encrypted_key, key_iv, key_tag',
      )
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single<{
        id: string;
        provider: string;
        provider_config: Record<string, unknown> | null;
        is_active: boolean;
        encrypted_key: string;
        key_iv: string;
        key_tag: string;
      }>();

    if (error || !data)
      throw new NotFoundException('Provider connection not found');
    if (!data.is_active) {
      throw new BadRequestException('Provider connection is deactivated');
    }

    return {
      id: data.id,
      provider: data.provider,
      provider_config: data.provider_config ?? {},
      api_key: this.crypto.decrypt(
        data.encrypted_key,
        data.key_iv,
        data.key_tag,
      ),
    };
  }

  async testConnection(workspaceId: string, id: string, userId: string) {
    const connection = await this.findOne(workspaceId, id);
    const key = await this.getDecryptedKey(workspaceId, id);
    const { data: conn } = await this.supabase.admin
      .from('provider_connections')
      .select('provider, provider_config')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .single<{
        provider: string;
        provider_config: Record<string, unknown> | null;
      }>();

    let testPassed = false;
    try {
      if (conn?.provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          redirect: 'error',
          headers: { Authorization: `Bearer ${key}` },
        });
        testPassed = res.ok;
      } else if (conn?.provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          redirect: 'error',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        });
        testPassed = res.ok;
      } else if (conn?.provider === 'google') {
        const res = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models',
          {
            redirect: 'error',
            headers: { 'x-goog-api-key': key },
          },
        );
        testPassed = res.ok;
      } else if (conn?.provider === 'cohere') {
        const res = await fetch('https://api.cohere.com/v1/models', {
          redirect: 'error',
          headers: { Authorization: `Bearer ${key}` },
        });
        testPassed = res.ok;
      } else if (
        conn?.provider === 'mistral' ||
        conn?.provider === 'groq' ||
        conn?.provider === 'together' ||
        conn?.provider === 'qwen' ||
        conn?.provider === 'kimi' ||
        conn?.provider === 'deepseek' ||
        conn?.provider === 'custom'
      ) {
        const cfg = conn.provider_config ?? {};
        const base =
          typeof cfg['base_url'] === 'string'
            ? await normalizeSafeOutboundBaseUrl(
                String(cfg['base_url']),
                `${conn.provider} provider base_url`,
              )
            : conn.provider === 'mistral'
              ? 'https://api.mistral.ai/v1'
              : conn.provider === 'groq'
                ? 'https://api.groq.com/openai/v1'
                : conn.provider === 'together'
                  ? 'https://api.together.xyz/v1'
                  : conn.provider === 'qwen'
                    ? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
                    : conn.provider === 'kimi'
                      ? 'https://api.moonshot.cn/v1'
                      : conn.provider === 'deepseek'
                        ? 'https://api.deepseek.com/v1'
                        : null;
        if (!base) {
          testPassed = key.length > 10;
        } else {
          const res = await fetch(`${base}/models`, {
            redirect: 'error',
            headers: { Authorization: `Bearer ${key}` },
          });
          testPassed = res.ok;
        }
      } else if (conn?.provider === 'azure_openai') {
        const cfg = conn.provider_config ?? {};
        const base =
          typeof cfg['base_url'] === 'string'
            ? await normalizeSafeOutboundBaseUrl(
                String(cfg['base_url']),
                'azure_openai provider base_url',
              )
            : null;
        if (!base) {
          testPassed = false;
        } else {
          const res = await fetch(`${base}/models`, {
            redirect: 'error',
            headers: { 'api-key': key },
          });
          testPassed = res.ok;
        }
      } else {
        testPassed = key.length > 10;
      }
    } catch {
      testPassed = false;
    }

    await this.supabase.admin
      .from('provider_connections')
      .update({
        last_tested_at: new Date().toISOString(),
        test_passed: testPassed,
      })
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    await this.safeAudit({
      workspaceId: connection.workspace_id,
      userId,
      action: 'update',
      resource: 'provider_connection_test',
      resourceId: id,
      success: testPassed,
      errorCode: testPassed ? undefined : 'ConnectionTestFailed',
      metadata: { provider: connection.provider },
    });
    return { success: testPassed };
  }

  async setActive(
    workspaceId: string,
    id: string,
    userId: string,
    isActive: boolean,
  ) {
    const { data, error } = await this.supabase.admin
      .from('provider_connections')
      .update({ is_active: isActive })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select(
        'id, workspace_id, entity_id, provider, display_name, key_preview, provider_config, is_active, last_tested_at, test_passed, created_at',
      )
      .maybeSingle<ProviderConnectionRow>();

    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException('Provider connection not found');

    await this.safeAudit({
      workspaceId,
      userId,
      action: 'update',
      resource: 'provider_connection',
      resourceId: id,
      metadata: {
        provider: data.provider,
        displayName: data.display_name,
        isActive,
      },
    });
    return data;
  }

  async remove(workspaceId: string, id: string, userId: string) {
    const connection = await this.findOne(workspaceId, id);
    await this.supabase.admin
      .from('provider_connections')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);
    await this.safeAudit({
      workspaceId: connection.workspace_id,
      userId,
      action: 'delete',
      resource: 'provider_connection',
      resourceId: id,
      metadata: {
        provider: connection.provider,
        displayName: connection.display_name,
      },
    });
    return { success: true };
  }

  private errorCode(error: unknown) {
    if (error instanceof Error && error.name) return error.name;
    return 'UnknownError';
  }

  private async normalizeProviderConfig(
    config: Record<string, unknown> | undefined,
    provider: string,
  ) {
    const next = { ...(config ?? {}) };
    if (typeof next['base_url'] === 'string' && next['base_url'].trim()) {
      next['base_url'] = await normalizeSafeOutboundBaseUrl(
        next['base_url'],
        `${provider} provider base_url`,
      );
    }
    return next;
  }

  private async safeAudit(input: Parameters<AuditService['logAction']>[0]) {
    try {
      await this.audit.logAction(input);
    } catch {
      // Audit failures must not block the primary provider operation.
    }
  }
}
