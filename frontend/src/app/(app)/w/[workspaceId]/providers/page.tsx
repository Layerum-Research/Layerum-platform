'use client';

import { FormEvent, use, useMemo, useState } from 'react';
import { Inter } from 'next/font/google';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Server, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { ConfirmDestructiveModal } from '@/components/confirm-destructive-modal';
import { Modal } from '@/components/modal';
import { ProviderIcon } from '@/components/provider-icon';
import { Select } from '@/components/select';
import { WorkspaceTopbar } from '@/components/workspace-topbar';
import { WorkspaceAccessGate, useWorkspaceAccess } from '@/components/workspace-access';
import { useAuth } from '@/providers/auth-provider';
import { SkeletonRows } from '@/components/loader';
import './providers-page.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const providers = [
  'openai',
  'anthropic',
  'cohere',
  'google',
  'mistral',
  'groq',
  'together',
  'azure_openai',
  'qwen',
  'kimi',
  'deepseek',
  'custom',
] as const;

type ProviderKey = (typeof providers)[number];

function getProviderTitle(provider: string) {
  return provider
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function ProvidersPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { session } = useAuth();
  const token = session?.access_token;
  const { workspaceId } = use(params);
  const access = useWorkspaceAccess();
  const canManageProviders = access.can({ type: 'permission', permission: 'providers.manage' });
  const queryClient = useQueryClient();

  const [provider, setProvider] = useState<ProviderKey>('openai');
  const [displayName, setDisplayName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const providerList = useQuery({
    queryKey: ['providers', workspaceId],
    queryFn: () => api.listProviders(token!, workspaceId),
    enabled: Boolean(token && canManageProviders),
    placeholderData: keepPreviousData,
  });

  const create = useMutation({
    mutationFn: () =>
      api.createProvider(token!, workspaceId, {
        provider,
        display_name: displayName,
        api_key: apiKey,
        provider_config: baseUrl.trim() ? { base_url: baseUrl.trim() } : undefined,
      }),
    onSuccess: () => {
      toast.success('Provider added');
      queryClient.invalidateQueries({ queryKey: ['providers', workspaceId] });
      setDisplayName('');
      setApiKey('');
      setBaseUrl('');
      setCreateOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testConnection = useMutation({
    mutationFn: (id: string) => api.testProvider(token!, workspaceId, id),
    onSuccess: (result) =>
      toast[result.success ? 'success' : 'error'](
        result.success ? 'Connection passed' : 'Connection failed',
      ),
    onError: (error: Error) => toast.error(error.message),
  });

  const setActive = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      api.setProviderActive(token!, workspaceId, input.id, input.isActive),
    onSuccess: (connection) => {
      toast.success(connection.is_active ? 'Provider activated' : 'Provider deactivated');
      queryClient.invalidateQueries({ queryKey: ['providers', workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteProvider(token!, workspaceId, id),
    onSuccess: () => {
      toast.success('Provider removed');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['providers', workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const providerCards = useMemo(() => {
    return (providerList.data ?? []).map((connection) => ({
      connection,
      title: connection.display_name?.trim() || getProviderTitle(connection.provider),
      providerLabel: getProviderTitle(connection.provider),
    }));
  }, [providerList.data]);

  function openCreateModal(defaultProvider: ProviderKey) {
    setProvider(defaultProvider);
    setCreateOpen(true);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  if (!canManageProviders) {
    return (
      <div className={`layerum-page providers-page ${inter.className}`}>
        <WorkspaceTopbar section="Workspace" page="Providers" />
        <WorkspaceAccessGate
          requirement={{ type: 'permission', permission: 'providers.manage' }}
          title="Providers access required"
          description="You need the Manage providers permission to view this page."
        >
          <div />
        </WorkspaceAccessGate>
      </div>
    );
  }

  return (
    <div className={`layerum-page providers-page ${inter.className}`}>
      <WorkspaceTopbar section="Workspace" page="Providers" />

      <section className="providers-content">
        <div className="providers-main-head">
          <div className="providers-section-head">
            <h2>AI Providers</h2>
            <p>Manage global infrastructure connections and API authentication.</p>
          </div>
          <button
            type="button"
            className="providers-primary"
            onClick={() => openCreateModal('openai')}
          >
            <Plus size={14} />
            Add new Provider
          </button>
        </div>

        <div className="providers-cards">
          {providerCards.map((card) => {
            const isConnected = card.connection.is_active !== false;
            const statusLabel = isConnected ? 'ACTIVE' : 'INACTIVE';
            const pending =
              (testConnection.isPending && testConnection.variables === card.connection.id) ||
              (remove.isPending && remove.variables === card.connection.id) ||
              (setActive.isPending && setActive.variables?.id === card.connection.id);

            return (
              <article
                key={card.connection.id}
                className={`providers-card ${isConnected ? 'is-active' : 'is-inactive'}`}
              >
                <header className="providers-card-head">
                  <div className="providers-card-title-wrap">
                    <div className="providers-card-icon">
                      <ProviderIcon provider={card.connection.provider} size={20} />
                    </div>
                    <div>
                      <h3>{card.title}</h3>
                      <p className="providers-provider-name">{card.providerLabel}</p>
                      <p className={`providers-status ${isConnected ? 'active' : 'inactive'}`}>
                        <span />
                        {statusLabel}
                      </p>
                    </div>
                  </div>
                  {isConnected ? <ShieldCheck size={14} className="providers-card-shield" /> : null}
                </header>

                <div className="providers-card-actions">
                  <button
                    type="button"
                    className="providers-button-muted"
                    disabled={pending}
                    onClick={() => testConnection.mutate(card.connection.id)}
                  >
                    Test
                  </button>
                  <button
                    type="button"
                    className={isConnected ? 'providers-button-muted' : 'providers-button-activate'}
                    disabled={pending}
                    onClick={() =>
                      setActive.mutate({ id: card.connection.id, isActive: !isConnected })
                    }
                  >
                    {isConnected ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    className="providers-button-danger"
                    disabled={pending}
                    onClick={() =>
                      setDeleteTarget({
                        id: card.connection.id,
                        title: card.title,
                      })
                    }
                    aria-label={`Delete ${card.title} provider`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            );
          })}
          {providerList.isLoading ? <SkeletonRows count={2} height={90} /> : null}
          {!providerList.isLoading && !providerCards.length ? (
            <article className="providers-card is-inactive">
              <header className="providers-card-head">
                <div className="providers-card-title-wrap">
                  <div className="providers-card-icon">
                    <Server size={16} />
                  </div>
                  <div>
                    <h3>No Providers Yet</h3>
                    <p className="providers-status inactive">
                      <span />
                      INACTIVE
                    </p>
                  </div>
                </div>
              </header>
              <div className="providers-card-actions">
                <button
                  type="button"
                  className="providers-button-connect"
                  onClick={() => openCreateModal('openai')}
                >
                  Connect Provider
                </button>
              </div>
            </article>
          ) : null}
        </div>

      </section>

      <Modal
        open={createOpen}
        title="Add Provider"
        onOpenChange={setCreateOpen}
        disableClose={create.isPending}
      >
        <form className="layerum-stack" onSubmit={onSubmit}>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Provider</label>
            <p className="layerum-form-hint">Model vendor that owns this API key.</p>
            <Select
              value={provider}
              onChange={(value) => setProvider(value as ProviderKey)}
              options={providers.map((name) => ({ value: name, label: name }))}
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Display Name</label>
            <p className="layerum-form-hint">Readable alias for this credential in your workspace.</p>
            <input
              className="layerum-input"
              placeholder="OpenAI Production Key"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">API Key</label>
            <p className="layerum-form-hint">Secret key will be encrypted and stored securely.</p>
            <input
              className="layerum-input"
              placeholder="sk-..."
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              required
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Base URL (optional)</label>
            <p className="layerum-form-hint">
              Leave empty for default provider endpoint. Required for <code>azure_openai</code> and usually for{' '}
              <code>custom</code>.
            </p>
            <input
              className="layerum-input"
              placeholder="https://api.provider.com/v1"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </div>
          <button className="layerum-button" type="submit" disabled={create.isPending}>
            Create connection
          </button>
        </form>
      </Modal>

      <ConfirmDestructiveModal
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Provider"
        description={
          deleteTarget ? (
            <>
              Delete provider connection <strong>{deleteTarget.title}</strong>. Model configs using this
              provider may stop working.
            </>
          ) : (
            'This action is irreversible.'
          )
        }
        confirmLabel="Delete provider"
        isPending={remove.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          remove.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
