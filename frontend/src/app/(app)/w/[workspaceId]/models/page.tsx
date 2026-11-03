'use client';

import { FormEvent, use, useEffect, useMemo, useState } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  BadgeCheck,
  Brain,
  CheckCircle2,
  ChevronDown,
  Cpu,
  MoreHorizontal,
  Plus,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { ConfirmDestructiveModal } from '@/components/confirm-destructive-modal';
import { useAuth } from '@/providers/auth-provider';
import { Modal } from '@/components/modal';
import { Select } from '@/components/select';
import { WorkspaceTopbar } from '@/components/workspace-topbar';
import { WorkspaceAccessGate, useWorkspaceAccess } from '@/components/workspace-access';
import type { ConfigModelRef, ModelConfig } from '@/lib/types';
import { readCachedQuery, writeCachedQuery } from '@/lib/query-persist';
import { SkeletonRows } from '@/components/loader';
import { TablePagination } from '@/components/table-pagination';
import { flipMenuIfClipped } from '@/lib/menu-placement';
import './models-page.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400'],
});

const MODEL_HELP_TOPICS: Array<{ title: string; description: string }> = [
  {
    title: 'Chunk Strategy',
    description:
      'Defines how source text is segmented before indexing. Different strategies change recall and precision tradeoffs.',
  },
  {
    title: 'Chunk Size',
    description:
      'Controls how much text goes into each chunk. Smaller chunks are more precise; larger chunks carry broader context.',
  },
  {
    title: 'Embedding Doc Prefix',
    description:
      'A string prepended to each document chunk before embedding, useful for domain-specific retrieval behavior.',
  },
  {
    title: 'Embedding Query Prefix',
    description:
      'A string prepended to user queries before embedding, helping align query vectors with indexed document vectors.',
  },
  {
    title: 'System Prompt',
    description:
      'Instructions for the generation model response behavior. This does not change embedding vectors directly.',
  },
];

type ModelOption = {
  id: string;
  provider: string;
  display_name: string;
  capabilities?: string[] | null;
};

const NO_TEMPERATURE_CAPABILITY = 'no_temperature';

function acceptsTemperature(model?: { capabilities?: string[] | null }) {
  return !model?.capabilities?.includes(NO_TEMPERATURE_CAPABILITY);
}

function toModelOptions(models: ModelOption[]) {
  return models.map((model) => ({ value: model.id, label: model.display_name }));
}

function withCurrentModel(models: ModelOption[], provider: string, current?: ModelOption) {
  if (!current || current.provider !== provider || models.some((model) => model.id === current.id)) {
    return models;
  }
  return [current, ...models];
}

function DeprecatedBadge({ model }: { model?: ConfigModelRef }) {
  return model?.is_active === false ? <span className="model-deprecated">Deprecated</span> : null;
}

function lastUpdatedLabel(value?: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 36 * 60 * 60 * 1000) {
    return formatDistanceToNowStrict(date, { addSuffix: true });
  }
  return format(date, 'MMM d, yyyy');
}

export default function ModelsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { session } = useAuth();
  const token = session?.access_token;
  const { workspaceId } = use(params);
  const access = useWorkspaceAccess();
  const canRunQuery = access.can({ type: 'permission', permission: 'query.run' });
  const queryClient = useQueryClient();

  const [name, setName] = useState('Default Config');
  const [llmModelId, setLlmModelId] = useState('');
  const [embeddingModelId, setEmbeddingModelId] = useState('');
  const [llmProviderConnectionId, setLlmProviderConnectionId] = useState('');
  const [embeddingProviderConnectionId, setEmbeddingProviderConnectionId] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [topK, setTopK] = useState(8);
  const [chunkStrategy, setChunkStrategy] = useState<'fixed' | 'sliding' | 'semantic'>('fixed');
  const [chunkSize, setChunkSize] = useState(512);
  const [chunkOverlap, setChunkOverlap] = useState(64);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [embeddingDocPrefix, setEmbeddingDocPrefix] = useState('');
  const [embeddingQueryPrefix, setEmbeddingQueryPrefix] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createHelpOpen, setCreateHelpOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editHelpOpen, setEditHelpOpen] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState('');
  const [editName, setEditName] = useState('');
  const [editLlmModelId, setEditLlmModelId] = useState('');
  const [editEmbeddingModelId, setEditEmbeddingModelId] = useState('');
  const [editLlmProviderConnectionId, setEditLlmProviderConnectionId] = useState('');
  const [editEmbeddingProviderConnectionId, setEditEmbeddingProviderConnectionId] = useState('');
  const [editTemperature, setEditTemperature] = useState(0.7);
  const [editTopK, setEditTopK] = useState(8);
  const [editChunkStrategy, setEditChunkStrategy] = useState<'fixed' | 'sliding' | 'semantic'>('fixed');
  const [editChunkSize, setEditChunkSize] = useState(512);
  const [editChunkOverlap, setEditChunkOverlap] = useState(64);
  const [editSystemPrompt, setEditSystemPrompt] = useState('');
  const [editEmbeddingDocPrefix, setEditEmbeddingDocPrefix] = useState('');
  const [editEmbeddingQueryPrefix, setEditEmbeddingQueryPrefix] = useState('');
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModelConfig | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const providers = useQuery({
    queryKey: ['providers', workspaceId],
    queryFn: () => api.listProviders(token!, workspaceId),
    enabled: Boolean(token && canRunQuery),
    placeholderData: keepPreviousData,
  });

  const providerConnectionOptions = (providers.data ?? []).map((provider) => ({
    value: provider.id,
    label: `${provider.display_name} (${provider.provider})${provider.is_active === false ? ' · inactive' : ''}`,
  }));

  const definitions = useQuery({
    queryKey: ['model-definitions'],
    queryFn: () => api.listModelDefinitions(token!),
    enabled: Boolean(token && canRunQuery),
    placeholderData: keepPreviousData,
  });

  const cachedConfigs = useMemo(
    () => readCachedQuery<ModelConfig[]>(`model-configs:${workspaceId}`),
    [workspaceId],
  );

  const configs = useQuery({
    queryKey: ['model-configs', workspaceId],
    queryFn: () => api.listModelConfigs(token!, workspaceId),
    enabled: Boolean(token && canRunQuery),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    initialData: cachedConfigs?.data,
    initialDataUpdatedAt: cachedConfigs?.updatedAt,
  });

  useEffect(() => {
    if (configs.data) {
      writeCachedQuery(
        `model-configs:${workspaceId}`,
        configs.data,
        configs.dataUpdatedAt || Date.now(),
      );
    }
  }, [configs.data, configs.dataUpdatedAt, workspaceId]);

  const allLlmModels = useMemo(
    () => (definitions.data ?? []).filter((model) => model.model_type === 'llm'),
    [definitions.data],
  );
  const allEmbeddingModels = useMemo(
    () => (definitions.data ?? []).filter((model) => model.model_type === 'embedding'),
    [definitions.data],
  );
  const providerByConnectionId = useMemo(
    () => new Map((providers.data ?? []).map((provider) => [provider.id, provider.provider])),
    [providers.data],
  );
  const selectedLlmProvider = providerByConnectionId.get(llmProviderConnectionId) ?? '';
  const selectedEmbeddingProvider = providerByConnectionId.get(embeddingProviderConnectionId) ?? '';
  const selectedEditLlmProvider = providerByConnectionId.get(editLlmProviderConnectionId) ?? '';
  const selectedEditEmbeddingProvider = providerByConnectionId.get(editEmbeddingProviderConnectionId) ?? '';

  const llmModels = useMemo(
    () => allLlmModels.filter((model) => model.provider === selectedLlmProvider),
    [allLlmModels, selectedLlmProvider],
  );
  const embeddingModels = useMemo(
    () => allEmbeddingModels.filter((model) => model.provider === selectedEmbeddingProvider),
    [allEmbeddingModels, selectedEmbeddingProvider],
  );
  const editingConfig = configs.data?.find((config) => config.id === editingConfigId);
  const editLlmModels = useMemo(
    () =>
      withCurrentModel(
        allLlmModels.filter((model) => model.provider === selectedEditLlmProvider),
        selectedEditLlmProvider,
        editingConfig?.llm,
      ),
    [allLlmModels, selectedEditLlmProvider, editingConfig?.llm],
  );
  const editEmbeddingModels = useMemo(
    () =>
      withCurrentModel(
        allEmbeddingModels.filter((model) => model.provider === selectedEditEmbeddingProvider),
        selectedEditEmbeddingProvider,
        editingConfig?.embedding,
      ),
    [allEmbeddingModels, selectedEditEmbeddingProvider, editingConfig?.embedding],
  );

  const safeLlmModelId = llmModels.some((model) => model.id === llmModelId) ? llmModelId : '';
  const safeEmbeddingModelId =
    embeddingModels.some((model) => model.id === embeddingModelId) ? embeddingModelId : '';
  const safeEditLlmModelId =
    editLlmModels.some((model) => model.id === editLlmModelId) ? editLlmModelId : '';
  const safeEditEmbeddingModelId =
    editEmbeddingModels.some((model) => model.id === editEmbeddingModelId) ? editEmbeddingModelId : '';
  const createAcceptsTemperature = acceptsTemperature(
    llmModels.find((model) => model.id === safeLlmModelId),
  );
  const editAcceptsTemperature = acceptsTemperature(
    editLlmModels.find((model) => model.id === safeEditLlmModelId),
  );

  const createConfig = useMutation({
    mutationFn: () =>
      api.createModelConfig(token!, workspaceId, {
        name,
        llm_model_id: llmModelId,
        embedding_model_id: embeddingModelId,
        provider_connection_id: llmProviderConnectionId || undefined,
        llm_provider_connection_id: llmProviderConnectionId || undefined,
        embedding_provider_connection_id: embeddingProviderConnectionId || undefined,
        system_prompt: systemPrompt.trim() || undefined,
        embedding_doc_prefix: embeddingDocPrefix.trim() || undefined,
        embedding_query_prefix: embeddingQueryPrefix.trim() || undefined,
        temperature,
        top_k: topK,
        chunk_strategy: chunkStrategy,
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
      }),
    onSuccess: () => {
      toast.success('Model config created');
      queryClient.invalidateQueries({ queryKey: ['model-configs', workspaceId] });
      setCreateOpen(false);
      setCreateHelpOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteConfig = useMutation({
    mutationFn: (id: string) => api.deleteModelConfig(token!, workspaceId, id),
    onSuccess: () => {
      toast.success('Model config deleted');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['model-configs', workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateConfig = useMutation({
    mutationFn: () =>
      api.updateModelConfig(token!, workspaceId, editingConfigId, {
        name: editName,
        llm_model_id: editLlmModelId,
        embedding_model_id: editEmbeddingModelId,
        provider_connection_id: editLlmProviderConnectionId || undefined,
        llm_provider_connection_id: editLlmProviderConnectionId || undefined,
        embedding_provider_connection_id: editEmbeddingProviderConnectionId || undefined,
        system_prompt: editSystemPrompt.trim() || undefined,
        embedding_doc_prefix: editEmbeddingDocPrefix.trim() || undefined,
        embedding_query_prefix: editEmbeddingQueryPrefix.trim() || undefined,
        temperature: editTemperature,
        top_k: editTopK,
        chunk_strategy: editChunkStrategy,
        chunk_size: editChunkSize,
        chunk_overlap: editChunkOverlap,
      }),
    onSuccess: () => {
      toast.success('Model config updated');
      queryClient.invalidateQueries({ queryKey: ['model-configs', workspaceId] });
      setEditOpen(false);
      setEditHelpOpen(false);
      setEditingConfigId('');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!llmProviderConnectionId || !embeddingProviderConnectionId) {
      toast.error('Select LLM and embedding provider connections');
      return;
    }
    if (!safeLlmModelId || !safeEmbeddingModelId) {
      toast.error('Select LLM and embedding models');
      return;
    }
    createConfig.mutate();
  }

  function openEdit(config: ModelConfig) {
    setEditingConfigId(config.id);
    setEditName(config.name ?? '');
    setEditLlmModelId(config.llm_model_id ?? '');
    setEditEmbeddingModelId(config.embedding_model_id ?? '');
    setEditLlmProviderConnectionId(config.llm_provider_connection_id ?? config.provider_connection_id ?? '');
    setEditEmbeddingProviderConnectionId(
      config.embedding_provider_connection_id ?? config.provider_connection_id ?? '',
    );
    setEditTemperature(Number(config.temperature ?? 0.7));
    setEditTopK(Number(config.top_k ?? 8));
    setEditChunkStrategy(config.chunk_strategy ?? 'fixed');
    setEditChunkSize(Number(config.chunk_size ?? 512));
    setEditChunkOverlap(Number(config.chunk_overlap ?? 64));
    setEditSystemPrompt(config.system_prompt ?? '');
    setEditEmbeddingDocPrefix(config.embedding_doc_prefix ?? '');
    setEditEmbeddingQueryPrefix(config.embedding_query_prefix ?? '');
    setEditOpen(true);
  }

  function onEditSubmit(event: FormEvent) {
    event.preventDefault();
    if (!editLlmProviderConnectionId || !editEmbeddingProviderConnectionId) {
      toast.error('Select LLM and embedding provider connections');
      return;
    }
    if (!safeEditLlmModelId || !safeEditEmbeddingModelId) {
      toast.error('Select LLM and embedding models');
      return;
    }
    if (!editingConfigId) {
      toast.error('Select config to edit');
      return;
    }
    updateConfig.mutate();
  }

  const configList = useMemo(() => configs.data ?? [], [configs.data]);
  const filteredConfigs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return configList;
    return configList.filter((config) => {
      const name = (config.name ?? '').toLowerCase();
      const id = config.id.toLowerCase();
      const llm = (config.llm?.display_name ?? config.llm_model_id ?? '').toLowerCase();
      const embedding = (config.embedding?.display_name ?? config.embedding_model_id ?? '').toLowerCase();
      return (
        name.includes(query) ||
        id.includes(query) ||
        llm.includes(query) ||
        embedding.includes(query)
      );
    });
  }, [configList, search]);
  const pageSize = 15;
  const totalItems = filteredConfigs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const paginatedConfigs = useMemo(
    () => filteredConfigs.slice(pageStart, pageEnd),
    [filteredConfigs, pageStart, pageEnd],
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    setOpenActionsId(null);
  }, [safeCurrentPage]);

  const temperatureConfigs = configList.filter((config) => acceptsTemperature(config.llm));
  const avgTemp =
    temperatureConfigs.length > 0
      ? (
          temperatureConfigs.reduce((acc, config) => acc + Number(config.temperature ?? 0.7), 0) /
          temperatureConfigs.length
        ).toFixed(2)
      : '0.00';
  const llmCounts = configList.reduce<Record<string, number>>((acc, config) => {
    const name = config.llm?.display_name ?? 'Unknown';
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  const [primaryEngine, primaryCount] = Object.entries(llmCounts).sort((a, b) => b[1] - a[1])[0] ?? [
    'N/A',
    0,
  ];
  const configsCreatedThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return configList.reduce((count, config) => {
      if (!config.created_at) return count;
      const createdAt = new Date(config.created_at);
      if (Number.isNaN(createdAt.getTime())) return count;
      return createdAt >= monthStart ? count + 1 : count;
    }, 0);
  }, [configList]);
  const tokenEfficiency =
    configList.length > 0
      ? Math.max(
          0,
          Math.min(
            99.9,
            96 -
              configList.reduce((acc, config) => acc + Number(config.temperature ?? 0.7), 0) * 3.2,
          ),
        ).toFixed(1)
      : '0.0';

  if (!canRunQuery) {
    return (
      <div className={`layerum-page models-page ${inter.className}`}>
        <WorkspaceTopbar section="Workspace" page="Models" />
        <WorkspaceAccessGate
          requirement={{ type: 'permission', permission: 'query.run' }}
          title="Models access required"
          description="You need the Run queries permission to view model configurations."
        >
          <div />
        </WorkspaceAccessGate>
      </div>
    );
  }

  return (
    <div className={`layerum-page models-page ${inter.className}`}>
      <WorkspaceTopbar
        section="Workspace"
        page="Models"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search model configs..."
      />
      <div className="models-content">
        <header className="models-header">
          <div>
            <h1>Model Configurations</h1>
            <p>Manage and deploy standardized model presets across your organization.</p>
          </div>
          <button className="models-primary" type="button" onClick={() => setCreateOpen(true)}>
            <Plus size={12} />
            New Configuration
          </button>
        </header>

        <section className="models-kpis">
          <article className="active">
            <h3>ACTIVE CONFIGS</h3>
            <strong>{configList.length}</strong>
            <p>
              <TrendingUp size={12} /> +{configsCreatedThisMonth} this month
            </p>
          </article>
          <article>
            <h3>AVG. TEMPERATURE</h3>
            <strong>{avgTemp}</strong>
            <p>
              <CheckCircle2 size={12} /> Balanced output
            </p>
          </article>
          <article>
            <h3>PRIMARY ENGINE</h3>
            <strong>{primaryEngine}</strong>
            <p>
              <BadgeCheck size={12} />{' '}
              {configList.length ? Math.round((primaryCount / configList.length) * 100) : 0}% coverage
            </p>
          </article>
          <article>
            <h3>TOKEN EFFICIENCY</h3>
            <strong>{tokenEfficiency}%</strong>
            <p className="warm">
              <Sparkles size={12} /> Optimized
            </p>
          </article>
        </section>

        <section className="models-table-card">
          <div className="models-table-head">
            <span>CONFIGURATION NAME</span>
            <span>LLM ENGINE</span>
            <span>EMBEDDING MODEL</span>
            <span>TEMPERATURE</span>
            <span>LAST UPDATED</span>
            <span>ACTIONS</span>
          </div>
          <div className="models-table-body">
            {paginatedConfigs.map((config, index) => {
              const globalIndex = pageStart + index;
              const llmLabel = config.llm?.display_name ?? config.llm_model_id.slice(0, 8);
              const embeddingLabel =
                config.embedding?.display_name ?? config.embedding_model_id.slice(0, 8);
              const tempValue = Number(config.temperature ?? 0.7);
              const barWidth = `${Math.max(2, Math.min(100, tempValue * 100))}%`;
              const updated = lastUpdatedLabel(config.updated_at);
              return (
                <div key={config.id} className="models-row">
                  <span className="name-cell">
                    <i>
                      {globalIndex % 4 === 0 ? (
                        <Brain size={14} />
                      ) : globalIndex % 4 === 1 ? (
                        <Sparkles size={14} />
                      ) : globalIndex % 4 === 2 ? (
                        <Cpu size={14} />
                      ) : (
                        <Shielded />
                      )}
                    </i>
                    <b>{config.name}</b>
                    <small className={mono.className}>ID: {config.id.slice(0, 8).toUpperCase()}</small>
                  </span>
                  <span className={`chip ${mono.className}`}>
                    {llmLabel}
                    <DeprecatedBadge model={config.llm} />
                  </span>
                  <span className={`embedding ${mono.className}`}>
                    {embeddingLabel}
                    <DeprecatedBadge model={config.embedding} />
                  </span>
                  <span className="temp-cell">
                    {acceptsTemperature(config.llm) ? (
                      <>
                        {tempValue.toFixed(1)}
                        <u>
                          <em style={{ width: barWidth }} />
                        </u>
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                  <span className="updated">{updated}</span>
                  <span className="row-actions">
                    <div className="actions-menu-wrap">
                      <button
                        className="actions-trigger"
                        type="button"
                        aria-label="Actions"
                        onClick={() =>
                          setOpenActionsId((current) => (current === config.id ? null : config.id))
                        }
                      >
                        <span className="actions-trigger-label">Actions</span>
                        <ChevronDown className="actions-trigger-chevron" size={12} />
                        <MoreHorizontal className="actions-trigger-more" size={16} />
                      </button>
                      {openActionsId === config.id ? (
                        <div className="actions-menu" ref={flipMenuIfClipped}>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenActionsId(null);
                              openEdit(config);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => {
                              setOpenActionsId(null);
                              setDeleteTarget(config);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </span>
                </div>
              );
            })}
            {configs.isLoading ? <SkeletonRows count={4} height={52} /> : null}
            {!configs.isLoading && configList.length === 0 ? <p className="models-empty">No model configs yet.</p> : null}
            {!configs.isLoading && configList.length > 0 && filteredConfigs.length === 0 ? (
              <p className="models-empty">No model configs match your search.</p>
            ) : null}
          </div>
          <TablePagination
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            pageStart={pageStart}
            pageEnd={pageEnd}
            totalItems={totalItems}
            itemLabel="configurations"
            onPageChange={setCurrentPage}
            summaryClassName={mono.className}
          />
        </section>

        {/*
        <section className="models-map">
          <h2>Entity Deployment Map</h2>
          <div className="map-canvas">
            <div className="map-content" aria-hidden="true">
              <div className="map-root">PRODUCTION CLUSTER</div>
              <div className="map-nodes">
                <div>
                  <span>
                    <Bot size={12} /> Core-API-01
                  </span>
                  <p>GPT-4o Active</p>
                </div>
                <div>
                  <span>
                    <Brain size={12} /> Web-Gateway
                  </span>
                  <p>Analysis-Core Load</p>
                </div>
                <div>
                  <span>
                    <Cpu size={12} /> Dev-Sand
                  </span>
                  <p>Claude-Sonnet Standby</p>
                </div>
              </div>
            </div>
            <div className="map-coming-soon">Coming soon</div>
          </div>
        </section>
        */}
      </div>

      <Modal
        open={createOpen}
        title="Create Model Config"
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateHelpOpen(false);
        }}
        disableClose={createConfig.isPending}
        overlayFloating={
          <div className="models-help-overlay-wrap">
            <button
              type="button"
              className="models-help-trigger"
              onClick={() => setCreateHelpOpen((value) => !value)}
              aria-label="Open model config help"
              aria-expanded={createHelpOpen}
            >
              ?
            </button>
            {createHelpOpen ? (
              <section className="models-help-drawer" aria-label="Model config help">
                <header>
                  <h3>Model Config Guide</h3>
                  <button
                    type="button"
                    className="models-help-close"
                    onClick={() => setCreateHelpOpen(false)}
                    aria-label="Close help panel"
                  >
                    Close
                  </button>
                </header>
                <div className="models-help-content">
                  {MODEL_HELP_TOPICS.map((item) => (
                    <article key={item.title}>
                      <h4>{item.title}</h4>
                      <p>{item.description}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        }
        overlayFloatingClassName="models-help-overlay-floating"
      >
        <form className="layerum-stack" onSubmit={onSubmit}>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Config Name</label>
            <p className="layerum-form-hint">Internal name for this configuration profile.</p>
            <input className="layerum-input" placeholder="Default Config" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">LLM Provider Connection</label>
            <p className="layerum-form-hint">Provider key used for generation requests.</p>
            <Select
              value={llmProviderConnectionId}
              onChange={setLlmProviderConnectionId}
              options={providerConnectionOptions}
              placeholder="Select LLM provider connection"
              emptyLabel="No provider connections yet"
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">LLM Model</label>
            <p className="layerum-form-hint">Models are filtered by the selected LLM provider connection.</p>
            <Select
              value={safeLlmModelId}
              onChange={setLlmModelId}
              options={toModelOptions(llmModels)}
              placeholder={selectedLlmProvider ? 'Select LLM model' : 'Select LLM provider first'}
              emptyLabel="No models for this provider"
              disabled={!selectedLlmProvider}
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Embedding Provider Connection</label>
            <p className="layerum-form-hint">Provider key used for embedding requests.</p>
            <Select
              value={embeddingProviderConnectionId}
              onChange={setEmbeddingProviderConnectionId}
              options={providerConnectionOptions}
              placeholder="Select embedding provider connection"
              emptyLabel="No provider connections yet"
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Embedding Model</label>
            <p className="layerum-form-hint">Models are filtered by the selected embedding provider connection.</p>
            <Select
              value={safeEmbeddingModelId}
              onChange={setEmbeddingModelId}
              options={toModelOptions(embeddingModels)}
              placeholder={selectedEmbeddingProvider ? 'Select embedding model' : 'Select embedding provider first'}
              emptyLabel="No models for this provider"
              disabled={!selectedEmbeddingProvider}
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">System Prompt</label>
            <p className="layerum-form-hint">Optional default behavior prompt for answer generation.</p>
            <textarea
              className="layerum-textarea"
              placeholder="You are a precise assistant..."
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
            />
          </div>
          <div className="layerum-grid cols-2">
            <div className="layerum-form-field">
              <label className="layerum-form-label">Embedding Doc Prefix</label>
              <p className="layerum-form-hint">Prefix added before document text during embedding.</p>
              <input
                className="layerum-input"
                placeholder="passage: "
                value={embeddingDocPrefix}
                onChange={(event) => setEmbeddingDocPrefix(event.target.value)}
              />
            </div>
            <div className="layerum-form-field">
              <label className="layerum-form-label">Embedding Query Prefix</label>
              <p className="layerum-form-hint">Prefix added before user query embedding.</p>
              <input
                className="layerum-input"
                placeholder="query: "
                value={embeddingQueryPrefix}
                onChange={(event) => setEmbeddingQueryPrefix(event.target.value)}
              />
            </div>
          </div>
          <div className="layerum-grid cols-2">
            <div className="layerum-form-field">
              <label className="layerum-form-label">Temperature</label>
              <p className="layerum-form-hint">Creativity level for generation. Typical range: 0.0 - 1.0.</p>
              <input
                className="layerum-input"
                type="number"
                step="0.1"
                min={0}
                max={2}
                disabled={!createAcceptsTemperature}
                placeholder="Not supported by this model"
                value={createAcceptsTemperature ? temperature : ''}
                onChange={(event) => setTemperature(Number(event.target.value))}
              />
            </div>
            <div className="layerum-form-field">
              <label className="layerum-form-label">Top K</label>
              <p className="layerum-form-hint">How many retrieved chunks are passed to the model.</p>
              <input className="layerum-input" type="number" min={1} value={topK} onChange={(event) => setTopK(Number(event.target.value))} />
            </div>
            <div className="layerum-form-field">
              <label className="layerum-form-label">Chunk Strategy</label>
              <p className="layerum-form-hint">Controls how source text is segmented before embedding.</p>
              <Select
                value={chunkStrategy}
                onChange={(value) => setChunkStrategy(value as 'fixed' | 'sliding' | 'semantic')}
                options={[
                  { value: 'fixed', label: 'Fixed' },
                  { value: 'sliding', label: 'Sliding' },
                  { value: 'semantic', label: 'Semantic' },
                ]}
              />
            </div>
            <div className="layerum-form-field">
              <label className="layerum-form-label">Chunk Size</label>
              <p className="layerum-form-hint">Text size per segment before embedding.</p>
              <input className="layerum-input" type="number" min={64} value={chunkSize} onChange={(event) => setChunkSize(Number(event.target.value))} />
            </div>
            <div className="layerum-form-field">
              <label className="layerum-form-label">Chunk Overlap</label>
              <p className="layerum-form-hint">Shared context between neighboring chunks.</p>
              <input className="layerum-input" type="number" min={0} value={chunkOverlap} onChange={(event) => setChunkOverlap(Number(event.target.value))} />
            </div>
          </div>
          <button className="layerum-button" type="submit" disabled={createConfig.isPending}>Create config</button>
        </form>
      </Modal>

      <Modal
        open={editOpen}
        title="Edit Model Config"
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditingConfigId('');
            setEditHelpOpen(false);
          }
        }}
        disableClose={updateConfig.isPending}
        overlayFloating={
          <div className="models-help-overlay-wrap">
            <button
              type="button"
              className="models-help-trigger"
              onClick={() => setEditHelpOpen((value) => !value)}
              aria-label="Open model config help"
              aria-expanded={editHelpOpen}
            >
              ?
            </button>
            {editHelpOpen ? (
              <section className="models-help-drawer" aria-label="Model config help">
                <header>
                  <h3>Model Config Guide</h3>
                  <button
                    type="button"
                    className="models-help-close"
                    onClick={() => setEditHelpOpen(false)}
                    aria-label="Close help panel"
                  >
                    Close
                  </button>
                </header>
                <div className="models-help-content">
                  {MODEL_HELP_TOPICS.map((item) => (
                    <article key={item.title}>
                      <h4>{item.title}</h4>
                      <p>{item.description}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        }
        overlayFloatingClassName="models-help-overlay-floating"
      >
        <form className="layerum-stack" onSubmit={onEditSubmit}>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Config Name</label>
            <p className="layerum-form-hint">Internal name for this configuration profile.</p>
            <input className="layerum-input" placeholder="Default Config" value={editName} onChange={(event) => setEditName(event.target.value)} required />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">LLM Provider Connection</label>
            <p className="layerum-form-hint">Provider key used for generation requests.</p>
            <Select
              value={editLlmProviderConnectionId}
              onChange={setEditLlmProviderConnectionId}
              options={providerConnectionOptions}
              placeholder="Select LLM provider connection"
              emptyLabel="No provider connections yet"
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">LLM Model</label>
            <p className="layerum-form-hint">Models are filtered by the selected LLM provider connection.</p>
            <Select
              value={safeEditLlmModelId}
              onChange={setEditLlmModelId}
              options={toModelOptions(editLlmModels)}
              placeholder={selectedEditLlmProvider ? 'Select LLM model' : 'Select LLM provider first'}
              emptyLabel="No models for this provider"
              disabled={!selectedEditLlmProvider}
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Embedding Provider Connection</label>
            <p className="layerum-form-hint">Provider key used for embedding requests.</p>
            <Select
              value={editEmbeddingProviderConnectionId}
              onChange={setEditEmbeddingProviderConnectionId}
              options={providerConnectionOptions}
              placeholder="Select embedding provider connection"
              emptyLabel="No provider connections yet"
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Embedding Model</label>
            <p className="layerum-form-hint">Models are filtered by the selected embedding provider connection.</p>
            <Select
              value={safeEditEmbeddingModelId}
              onChange={setEditEmbeddingModelId}
              options={toModelOptions(editEmbeddingModels)}
              placeholder={selectedEditEmbeddingProvider ? 'Select embedding model' : 'Select embedding provider first'}
              emptyLabel="No models for this provider"
              disabled={!selectedEditEmbeddingProvider}
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">System Prompt</label>
            <p className="layerum-form-hint">Optional default behavior prompt for answer generation.</p>
            <textarea
              className="layerum-textarea"
              placeholder="You are a precise assistant..."
              value={editSystemPrompt}
              onChange={(event) => setEditSystemPrompt(event.target.value)}
            />
          </div>
          <div className="layerum-grid cols-2">
            <div className="layerum-form-field">
              <label className="layerum-form-label">Embedding Doc Prefix</label>
              <p className="layerum-form-hint">Prefix added before document text during embedding.</p>
              <input
                className="layerum-input"
                placeholder="passage: "
                value={editEmbeddingDocPrefix}
                onChange={(event) => setEditEmbeddingDocPrefix(event.target.value)}
              />
            </div>
            <div className="layerum-form-field">
              <label className="layerum-form-label">Embedding Query Prefix</label>
              <p className="layerum-form-hint">Prefix added before user query embedding.</p>
              <input
                className="layerum-input"
                placeholder="query: "
                value={editEmbeddingQueryPrefix}
                onChange={(event) => setEditEmbeddingQueryPrefix(event.target.value)}
              />
            </div>
          </div>
          <div className="layerum-grid cols-2">
            <div className="layerum-form-field">
              <label className="layerum-form-label">Temperature</label>
              <p className="layerum-form-hint">Creativity level for generation. Typical range: 0.0 - 1.0.</p>
              <input
                className="layerum-input"
                type="number"
                step="0.1"
                min={0}
                max={2}
                disabled={!editAcceptsTemperature}
                placeholder="Not supported by this model"
                value={editAcceptsTemperature ? editTemperature : ''}
                onChange={(event) => setEditTemperature(Number(event.target.value))}
              />
            </div>
            <div className="layerum-form-field">
              <label className="layerum-form-label">Top K</label>
              <p className="layerum-form-hint">How many retrieved chunks are passed to the model.</p>
              <input className="layerum-input" type="number" min={1} value={editTopK} onChange={(event) => setEditTopK(Number(event.target.value))} />
            </div>
            <div className="layerum-form-field">
              <label className="layerum-form-label">Chunk Strategy</label>
              <p className="layerum-form-hint">Controls how source text is segmented before embedding.</p>
              <Select
                value={editChunkStrategy}
                onChange={(value) => setEditChunkStrategy(value as 'fixed' | 'sliding' | 'semantic')}
                options={[
                  { value: 'fixed', label: 'Fixed' },
                  { value: 'sliding', label: 'Sliding' },
                  { value: 'semantic', label: 'Semantic' },
                ]}
              />
            </div>
            <div className="layerum-form-field">
              <label className="layerum-form-label">Chunk Size</label>
              <p className="layerum-form-hint">Text size per segment before embedding.</p>
              <input className="layerum-input" type="number" min={64} value={editChunkSize} onChange={(event) => setEditChunkSize(Number(event.target.value))} />
            </div>
            <div className="layerum-form-field">
              <label className="layerum-form-label">Chunk Overlap</label>
              <p className="layerum-form-hint">Shared context between neighboring chunks.</p>
              <input className="layerum-input" type="number" min={0} value={editChunkOverlap} onChange={(event) => setEditChunkOverlap(Number(event.target.value))} />
            </div>
          </div>
          <button className="layerum-button" type="submit" disabled={updateConfig.isPending}>Save changes</button>
        </form>
      </Modal>

      <ConfirmDestructiveModal
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Model Config"
        description={
          deleteTarget ? (
            <>
              This will permanently delete <strong>{deleteTarget.name}</strong>. Queries using this
              config may fail until you select another model config.
            </>
          ) : (
            'This action is irreversible.'
          )
        }
        confirmLabel="Delete config"
        isPending={deleteConfig.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteConfig.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}

function Shielded() {
  return <CheckCircle2 size={14} />;
}
