'use client';

import { CSSProperties, FormEvent, use, useMemo, useState } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Copy,
  Plus,
  RotateCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { env } from '@/lib/env';
import { ConfirmDestructiveModal } from '@/components/confirm-destructive-modal';
import type { Entity } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Modal } from '@/components/modal';
import { WorkspaceTopbar } from '@/components/workspace-topbar';
import { WorkspaceAccessGate, useWorkspaceAccess } from '@/components/workspace-access';
import { SkeletonRows } from '@/components/loader';
import './api-keys.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400'],
});

type FlatEntityNode = {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
  isRoot: boolean;
};

type ApiKeyCapability = 'query:read' | 'data:ingest' | 'config:manage';

const CAPABILITY_OPTIONS: Array<{ value: ApiKeyCapability; label: string; hint: string }> = [
  {
    value: 'query:read',
    label: 'Query Read',
    hint: 'Read entities/models/docs and run /v1/query.',
  },
  {
    value: 'data:ingest',
    label: 'Data Ingest',
    hint: 'Create entities/documents, upload, retry and delete.',
  },
  {
    value: 'config:manage',
    label: 'Config Manage',
    hint: 'Create providers and manage model configs via public API.',
  },
];

function flattenTree(nodes: Entity[], depth = 0, parentId: string | null = null): FlatEntityNode[] {
  const result: FlatEntityNode[] = [];
  for (const node of nodes) {
    result.push({
      id: node.id,
      name: node.name,
      depth,
      parentId,
      isRoot: depth === 0,
    });
    if (node.children?.length) {
      result.push(...flattenTree(node.children, depth + 1, node.id));
    }
  }
  return result;
}

function collectTreeIds(root: Entity): string[] {
  const result: string[] = [];
  const stack: Entity[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    result.push(node.id);
    if (node.children?.length) {
      for (const child of node.children) stack.push(child);
    }
  }
  return result;
}

function dateLabel(value: string | null) {
  if (!value) return '-';
  try {
    return format(new Date(value), 'MMM dd, yyyy');
  } catch {
    return '-';
  }
}

export default function ApiKeysPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { session } = useAuth();
  const token = session?.access_token;
  const { workspaceId } = use(params);
  const access = useWorkspaceAccess();
  const canManageKeys = access.can({ type: 'permission', permission: 'api_keys.manage' });
  const queryClient = useQueryClient();

  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [secretModal, setSecretModal] = useState<{ open: boolean; secret: string; name: string }>({
    open: false,
    secret: '',
    name: '',
  });
  const [name, setName] = useState('');
  const [selectedCapabilities, setSelectedCapabilities] = useState<ApiKeyCapability[]>([
    'query:read',
    'data:ingest',
  ]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [includeRootSubtrees, setIncludeRootSubtrees] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [rpmLimit, setRpmLimit] = useState('');
  const [dailyTokenLimit, setDailyTokenLimit] = useState('');

  const list = useQuery({
    queryKey: ['api-keys', workspaceId],
    queryFn: () => api.listApiKeys(token!, workspaceId),
    enabled: Boolean(token && canManageKeys),
    placeholderData: keepPreviousData,
  });

  const entities = useQuery({
    queryKey: ['entities-tree', workspaceId],
    queryFn: () => api.listEntityTree(token!, workspaceId),
    enabled: Boolean(token && canManageKeys),
    placeholderData: keepPreviousData,
  });

  const modelConfigs = useQuery({
    queryKey: ['model-configs', workspaceId],
    queryFn: () => api.listModelConfigs(token!, workspaceId),
    enabled: Boolean(token && canManageKeys),
    placeholderData: keepPreviousData,
  });

  const selectedKey =
    (selectedKeyId
      ? (list.data ?? []).find((k) => k.id === selectedKeyId) ?? null
      : null) ??
    (list.data ?? [])[0] ??
    null;
  const flatEntities = useMemo(
    () => flattenTree(entities.data ?? []),
    [entities.data],
  );
  const entityNameById = useMemo(
    () => new Map(flatEntities.map((item) => [item.id, item.name])),
    [flatEntities],
  );
  const rootSubtreeIds = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const root of entities.data ?? []) {
      map.set(root.id, collectTreeIds(root));
    }
    return map;
  }, [entities.data]);
  const effectiveEntityIds = useMemo(() => {
    const expanded = new Set(selectedEntities);
    if (includeRootSubtrees) {
      for (const entityId of selectedEntities) {
        const subtree = rootSubtreeIds.get(entityId);
        if (!subtree) continue;
        for (const id of subtree) expanded.add(id);
      }
    }
    return Array.from(expanded);
  }, [includeRootSubtrees, rootSubtreeIds, selectedEntities]);
  const inheritedOnlyIds = useMemo(
    () => effectiveEntityIds.filter((id) => !selectedEntities.includes(id)),
    [effectiveEntityIds, selectedEntities],
  );
  const visibleEntities = useMemo(
    () =>
      includeRootSubtrees
        ? flatEntities.filter((entity) => entity.isRoot)
        : flatEntities,
    [flatEntities, includeRootSubtrees],
  );
  const rootEntities = useMemo(
    () => visibleEntities.filter((entity) => entity.isRoot),
    [visibleEntities],
  );
  const childEntities = useMemo(
    () => visibleEntities.filter((entity) => !entity.isRoot),
    [visibleEntities],
  );
  const entitiesByRoot = useMemo(
    () =>
      rootEntities.map((root) => {
        const subtree = new Set(rootSubtreeIds.get(root.id) ?? []);
        const children = childEntities.filter((entity) => subtree.has(entity.id));
        return { root, children };
      }),
    [childEntities, rootEntities, rootSubtreeIds],
  );

  const create = useMutation({
    mutationFn: () =>
      api.createApiKey(token!, workspaceId, {
        name,
        capabilities: selectedCapabilities,
        allowed_entity_ids: effectiveEntityIds,
        allowed_model_config_ids: selectedModels,
        rpm_limit: rpmLimit ? Number(rpmLimit) : undefined,
        daily_token_limit: dailyTokenLimit ? Number(dailyTokenLimit) : undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] });
      setCreateOpen(false);
      resetForm();
      setSecretModal({ open: true, secret: result.secret, name: result.name });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(token!, workspaceId, id),
    onSuccess: () => {
      toast.success('API key revoked');
      setRevokeTarget(null);
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rotate = useMutation({
    mutationFn: (id: string) => api.rotateApiKey(token!, workspaceId, id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] });
      setSecretModal({ open: true, secret: result.secret, name: result.name });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function resetForm() {
    setName('');
    setSelectedCapabilities(['query:read', 'data:ingest']);
    setSelectedEntities([]);
    setIncludeRootSubtrees(false);
    setSelectedModels([]);
    setRpmLimit('');
    setDailyTokenLimit('');
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (selectedCapabilities.length === 0) {
      toast.error('Select at least one capability');
      return;
    }
    if (effectiveEntityIds.length === 0) {
      toast.error('Select at least one entity');
      return;
    }
    if (selectedModels.length === 0) {
      toast.error('Select at least one model config');
      return;
    }
    create.mutate();
  }

  function toggleItem<T extends string>(list: T[], id: T, setter: (v: T[]) => void) {
    setter(list.includes(id) ? list.filter((i) => i !== id) : [...list, id]);
  }

  function onToggleIncludeRootSubtrees(next: boolean) {
    setIncludeRootSubtrees(next);
    if (!next) return;
    setSelectedEntities((current) => current.filter((id) => rootSubtreeIds.has(id)));
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }

  if (!canManageKeys) {
    return (
      <div className={`layerum-page api-keys-page ${inter.className}`}>
        <WorkspaceTopbar section="API Management" page="API Keys" />
        <WorkspaceAccessGate
          requirement={{ type: 'permission', permission: 'api_keys.manage' }}
          title="API key access required"
          description="You need the Manage API keys permission to view this page."
        >
          <div />
        </WorkspaceAccessGate>
      </div>
    );
  }

  const command = `curl -X POST ${env.apiBaseUrl}/v1/query \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "entityId": "${selectedKey?.allowed_entity_ids[0] ?? '<entity-uuid>'}",
    "modelConfigId": "${selectedKey?.allowed_model_config_ids[0] ?? '<model-config-uuid>'}",
    "query": "Describe the relationship between data nodes."
  }'`;

  return (
    <div className={`layerum-page api-keys-page ${inter.className}`}>
      <WorkspaceTopbar section="API Management" page="API Keys" />

      <section className="api-keys-canvas">
        <header className="api-keys-head">
          <div>
            <h1>API Keys</h1>
            <p>
              Manage authentication keys for accessing the Layerum API. Use these keys to integrate
              automated workflows and model querying.
            </p>
          </div>
          <button className="api-keys-primary" onClick={() => setCreateOpen(true)} type="button">
            <Plus size={14} />
            Create New Key
          </button>
        </header>

        <section className="api-keys-table-card">
          <div className="api-keys-table-head">
            <span>NAME</span>
            <span>KEY</span>
            <span>SCOPE</span>
            <span>CREATED</span>
            <span>ACTIONS</span>
          </div>
          <div className="api-keys-table-body">
            {(list.data ?? []).map((item) => {
              const selected = selectedKey?.id === item.id;
              const modelName =
                (modelConfigs.data ?? []).find((m) => m.id === item.allowed_model_config_ids[0])?.name ??
                'All Models';
              const entityName = entityNameById.get(item.allowed_entity_ids[0]) ?? 'Workspace Root';
              return (
                <div
                  key={item.id}
                  className={`api-keys-row${selected ? ' selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedKeyId(item.id);
                    setOpenActionsId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedKeyId(item.id);
                      setOpenActionsId(null);
                    }
                  }}
                >
                  <span className="api-keys-name">{item.name}</span>
                  <span className={`api-keys-key ${mono.className}`}>
                    {item.key_prefix}...{item.last4}
                  </span>
                  <span className="api-keys-scope">
                    <span>
                      Entity: <b>{entityName}</b>
                    </span>
                    <span>
                      Model: <b>{modelName}</b>
                    </span>
                    <span>
                      Capabilities:{' '}
                      <b>{(item.capabilities ?? []).length > 0 ? item.capabilities.join(', ') : '-'}</b>
                    </span>
                  </span>
                  <span className="api-keys-created">{dateLabel(item.created_at)}</span>
                  <span className="api-keys-actions" onClick={(event) => event.stopPropagation()}>
                    {item.is_active && !item.revoked_at ? (
                      <div className="actions-menu-wrap">
                        <button
                          className="actions-trigger"
                          type="button"
                          onClick={() =>
                            setOpenActionsId((current) => (current === item.id ? null : item.id))
                          }
                        >
                          Actions <ChevronDown size={12} />
                        </button>
                        {openActionsId === item.id ? (
                          <div className="actions-menu">
                            <button
                              type="button"
                              onClick={() => {
                                rotate.mutate(item.id);
                                setOpenActionsId(null);
                              }}
                              disabled={rotate.isPending}
                            >
                              <RotateCw size={12} /> Rotate key
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                setOpenActionsId(null);
                                setRevokeTarget({ id: item.id, name: item.name });
                              }}
                              disabled={revoke.isPending}
                            >
                              <Trash2 size={12} /> Revoke key
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="revoked-pill">REVOKED</span>
                    )}
                  </span>
                </div>
              );
            })}
            {list.isLoading ? <SkeletonRows count={3} height={52} /> : null}
            {!list.isLoading && (list.data ?? []).length === 0 ? (
              <p className="api-keys-state">No API keys yet.</p>
            ) : null}
          </div>
        </section>

        <section className="api-keys-lower">
          <article className="api-keys-code-card">
            <header>
              <div>
                <span />
                <span />
                <span />
                <p className={mono.className}>POST /v1/query</p>
              </div>
              <button type="button" onClick={() => copyToClipboard(command)}>
                <Copy size={12} />
                Copy Command
              </button>
            </header>
            <pre className={mono.className}>{command}</pre>
          </article>

          <aside className="api-keys-info-col">
            <article className="api-keys-info-card">
              <header>
                <BookOpen size={16} />
                <h3>Integration Guide</h3>
              </header>
              <p>
                The API uses Bearer token authentication. Standard rate limits for Enterprise Tier are
                10,000 req/min.
              </p>
              <button type="button">View API Documentation →</button>
            </article>

            <article className="api-keys-info-card highlight">
              <header>
                <ShieldCheck size={16} />
                <h3>Security Best Practices</h3>
              </header>
              <ul>
                <li>
                  <CheckCircle2 size={13} />
                  Never commit keys to version control.
                </li>
                <li>
                  <CheckCircle2 size={13} />
                  Rotate keys every 90 days.
                </li>
              </ul>
            </article>
          </aside>
        </section>
      </section>

      <Modal open={createOpen} title="Create API Key" onOpenChange={setCreateOpen} disableClose={create.isPending}>
        <form className="layerum-stack api-keys-create-form" onSubmit={onSubmit}>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Name</label>
            <p className="layerum-form-hint">A label to identify this key.</p>
            <input className="layerum-input" placeholder="Production Bot" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="layerum-form-field">
            <label className="layerum-form-label">Capabilities</label>
            <p className="layerum-form-hint">
              Choose exactly what this key can do in external API and SDK.
            </p>
            <div className="layerum-api-keys-scroll-list compact">
              {CAPABILITY_OPTIONS.map((capability) => (
                <label
                  key={capability.value}
                  className="layerum-checkbox layerum-api-keys-model-row layerum-api-keys-checkbox"
                >
                  <input
                    className="layerum-api-keys-checkbox-input"
                    type="checkbox"
                    checked={selectedCapabilities.includes(capability.value)}
                    onChange={() =>
                      toggleItem(selectedCapabilities, capability.value, setSelectedCapabilities)
                    }
                  />
                  <span className="layerum-api-keys-checkbox-label layerum-api-keys-capability-text">
                    {capability.label}
                    <small className="layerum-list-meta">{capability.hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="layerum-form-field">
            <label className="layerum-form-label">Allowed Entities</label>
            <p className="layerum-form-hint">
              Select specific entities, or enable subtree mode to grant full access under selected root layers.
            </p>
            <label className="layerum-checkbox layerum-api-keys-mode-toggle layerum-api-keys-checkbox">
              <input
                className="layerum-api-keys-checkbox-input"
                type="checkbox"
                checked={includeRootSubtrees}
                onChange={(event) => onToggleIncludeRootSubtrees(event.target.checked)}
              />
              <span className="layerum-api-keys-checkbox-label">
                Include full subtree for selected root layers
              </span>
            </label>
            <div className="layerum-api-keys-scroll-list">
              <div className="layerum-api-keys-root-grid">
                {entitiesByRoot.map(({ root, children }) => {
                  const isRootInherited = inheritedOnlyIds.includes(root.id);
                  const isRootChecked = selectedEntities.includes(root.id);
                  return (
                    <div key={root.id} className="layerum-api-keys-root-column">
                      <label
                        className={`layerum-checkbox layerum-api-keys-entity-row layerum-api-keys-checkbox layerum-api-keys-root-item${isRootInherited ? ' inherited' : ''}`}
                      >
                        <input
                          className="layerum-api-keys-checkbox-input"
                          type="checkbox"
                          checked={isRootChecked}
                          onChange={() =>
                            toggleItem(selectedEntities, root.id, setSelectedEntities)
                          }
                        />
                        <span className="layerum-api-keys-checkbox-label layerum-api-keys-root-label">
                          {root.name}
                        </span>
                        <span className="layerum-tag layerum-api-keys-mini-tag">root</span>
                        {isRootInherited ? (
                          <span className="layerum-tag layerum-api-keys-mini-tag">
                            inherited
                          </span>
                        ) : null}
                      </label>
                      <div className="layerum-api-keys-children-column">
                        {children.map((entity) => {
                          const isInherited = inheritedOnlyIds.includes(entity.id);
                          const isChecked = selectedEntities.includes(entity.id);
                          return (
                            <label
                              key={entity.id}
                              className={`layerum-checkbox layerum-api-keys-entity-row layerum-api-keys-checkbox${isInherited ? ' inherited' : ''}`}
                              style={
                                {
                                  '--entity-offset': `${Math.min(entity.depth * 14, 56)}px`,
                                } as CSSProperties
                              }
                            >
                              <input
                                className="layerum-api-keys-checkbox-input"
                                type="checkbox"
                                checked={isChecked}
                                onChange={() =>
                                  toggleItem(selectedEntities, entity.id, setSelectedEntities)
                                }
                              />
                              <span className="layerum-api-keys-checkbox-label">{entity.name}</span>
                              {isInherited ? (
                                <span className="layerum-tag layerum-api-keys-mini-tag">
                                  inherited
                                </span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {visibleEntities.length === 0 ? (
                <span className="layerum-list-meta">No entities found.</span>
              ) : null}
            </div>
            <div className="layerum-list-meta layerum-api-keys-summary-row">
              <span>Directly selected: {selectedEntities.length}</span>
              <span>Effective access: {effectiveEntityIds.length}</span>
            </div>
          </div>

          <div className="layerum-form-field">
            <label className="layerum-form-label">Allowed Model Configs</label>
            <p className="layerum-form-hint">Which model configurations this key can use.</p>
            <div className="layerum-api-keys-scroll-list compact">
              {(modelConfigs.data ?? []).map((m) => (
                <label
                  key={m.id}
                  className="layerum-checkbox layerum-api-keys-model-row layerum-api-keys-checkbox"
                >
                  <input
                    className="layerum-api-keys-checkbox-input"
                    type="checkbox"
                    checked={selectedModels.includes(m.id)}
                    onChange={() => toggleItem(selectedModels, m.id, setSelectedModels)}
                  />
                  <span className="layerum-api-keys-checkbox-label">{m.name}</span>
                </label>
              ))}
              {modelConfigs.data?.length === 0 ? <span className="layerum-list-meta">No model configs found.</span> : null}
            </div>
          </div>

          <div className="layerum-form-field">
            <label className="layerum-form-label">RPM Limit (optional)</label>
            <p className="layerum-form-hint">Max requests per minute. Leave blank for unlimited.</p>
            <input className="layerum-input" type="number" min="1" max="5000" placeholder="60" value={rpmLimit} onChange={(e) => setRpmLimit(e.target.value)} />
          </div>

          <div className="layerum-form-field">
            <label className="layerum-form-label">Daily Token Limit (optional)</label>
            <p className="layerum-form-hint">Max tokens per day. Leave blank for unlimited.</p>
            <input className="layerum-input" type="number" min="1" placeholder="1000000" value={dailyTokenLimit} onChange={(e) => setDailyTokenLimit(e.target.value)} />
          </div>

          <button className="layerum-button" type="submit" disabled={create.isPending}>Create Key</button>
        </form>
      </Modal>

      <Modal open={secretModal.open} title="API Key Created" onOpenChange={(o) => setSecretModal((s) => ({ ...s, open: o }))}>
        <div className="layerum-stack">
          <p className="layerum-form-hint">Copy this key now. It will not be shown again.</p>
          <div className="layerum-api-keys-secret-row">
            <code className="layerum-input layerum-api-keys-secret-code">
              {secretModal.secret}
            </code>
            <button className="layerum-button ghost" onClick={() => copyToClipboard(secretModal.secret)} type="button">
              <Copy size={14} />
            </button>
          </div>
          <p className="layerum-list-meta">Key: {secretModal.name}</p>
        </div>
      </Modal>

      <ConfirmDestructiveModal
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title="Revoke API Key"
        description={
          revokeTarget ? (
            <>
              Revoke API key <strong>{revokeTarget.name}</strong>. Requests authenticated with this key
              will stop immediately.
            </>
          ) : (
            'This action is irreversible.'
          )
        }
        confirmLabel="Revoke key"
        isPending={revoke.isPending}
        onConfirm={() => {
          if (!revokeTarget) return;
          revoke.mutate(revokeTarget.id);
        }}
      />
    </div>
  );
}
