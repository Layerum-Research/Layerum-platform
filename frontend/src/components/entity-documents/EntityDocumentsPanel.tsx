'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileUp,
  Link2,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { Modal } from '@/components/modal';
import { Select } from '@/components/select';
import { ConfirmDestructiveModal } from '@/components/confirm-destructive-modal';
import type { DataSource, ModelConfig, SourceErrorDetails } from '@/lib/types';
import { readCachedQuery, writeCachedQuery } from '@/lib/query-persist';
import { SkeletonRows } from '@/components/loader';
import { flipMenuIfClipped } from '@/lib/menu-placement';
import './entity-documents.css';

type Props = {
  workspaceId: string;
  entityId: string;
  entityName: string;
  token?: string;
  onCountChange?: (count: number) => void;
};

function formatFileSize(source: DataSource) {
  const directSize = (source as DataSource & { file_size?: unknown }).file_size;
  const metadata = source.metadata as Record<string, unknown> | undefined;
  const sizeBytes =
    typeof directSize === 'number'
      ? directSize
      : typeof metadata?.size_bytes === 'number'
        ? metadata.size_bytes
        : typeof metadata?.file_size === 'number'
          ? metadata.file_size
          : null;
  if (!sizeBytes || sizeBytes <= 0) return '-';
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${sizeBytes} B`;
}

function sourceSizeBytes(source: DataSource) {
  const directSize = (source as DataSource & { file_size?: unknown }).file_size;
  const metadata = source.metadata as Record<string, unknown> | undefined;
  return typeof directSize === 'number'
    ? directSize
    : typeof metadata?.size_bytes === 'number'
      ? metadata.size_bytes
      : typeof metadata?.file_size === 'number'
        ? metadata.file_size
        : 0;
}

function numericVersion(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatBytes(value: number) {
  if (!value || value <= 0) return '-';
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function sourceIcon(sourceType: DataSource['source_type']) {
  switch (sourceType) {
    case 'url':
      return 'URL';
    case 'text':
      return 'TXT';
    case 'api':
      return 'API';
    default:
      return 'FILE';
  }
}

function statusTone(status?: string | null) {
  const value = (status ?? '').toLowerCase();
  if (value === 'failed' || value.includes('error')) return 'danger';
  if (value === 'processing' || value === 'pending') return 'warn';
  if (value === 'completed' || value === 'success') return 'ok';
  return 'muted';
}

function statusLabel(status?: string | null) {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ');
}

const visibilityOptions = [
  { value: 'self', label: 'This entity only' },
  { value: 'self_and_descendants', label: 'This entity and descendants' },
];

export function EntityDocumentsPanel({ workspaceId, entityId, entityName, token, onCountChange }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ['all-sources', workspaceId, entityId];

  const [docSearch, setDocSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [sourceErrorOpen, setSourceErrorOpen] = useState(false);
  const [sourceErrorDetails, setSourceErrorDetails] = useState<SourceErrorDetails | null>(null);
  const [deleteSingleTarget, setDeleteSingleTarget] = useState<{ sourceId: string; entityId: string; displayName: string } | null>(null);
  const [deleteBatchOpen, setDeleteBatchOpen] = useState(false);
  const [deleteBatchPending, setDeleteBatchPending] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Create-source form
  const [sourceType, setSourceType] = useState<'text' | 'url'>('text');
  const [displayName, setDisplayName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [sourceModelConfigId, setSourceModelConfigId] = useState('');
  const [visibility, setVisibility] = useState<'self' | 'self_and_descendants'>('self_and_descendants');

  // Upload form (multi-file)
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadModelConfigId, setUploadModelConfigId] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDocSearch('');
    setCurrentPage(1);
    setSelectedSourceIds([]);
    setOpenActionsId(null);
  }, [entityId]);

  useEffect(() => {
    function onEntityFilesDropped(event: Event) {
      const detail = (event as CustomEvent<{ entityId: string; files: File[] }>).detail;
      if (!detail || detail.entityId !== entityId) return;
      if (!detail.files || detail.files.length === 0) return;
      setUploadFiles(detail.files);
      setUploadOpen(true);
    }
    window.addEventListener('layerum:entity-files-dropped', onEntityFilesDropped);
    return () => window.removeEventListener('layerum:entity-files-dropped', onEntityFilesDropped);
  }, [entityId]);

  const allSources = useQuery({
    queryKey,
    queryFn: () => api.listSourcesAll(token!, workspaceId, entityId),
    enabled: Boolean(token && entityId),
    // Switching nodes keeps the previous entity's docs visible while the
    // new list loads instead of flashing an empty state.
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const sources = (query.state.data ?? []) as Array<{ status: string }>;
      return sources.some((item) => item.status === 'pending' || item.status === 'processing') ? 4000 : false;
    },
  });

  const cachedConfigs = useMemo(
    () => readCachedQuery<ModelConfig[]>(`model-configs:${workspaceId}`),
    [workspaceId],
  );

  const modelConfigs = useQuery({
    queryKey: ['model-configs', workspaceId],
    queryFn: () => api.listModelConfigs(token!, workspaceId),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
    initialData: cachedConfigs?.data,
    initialDataUpdatedAt: cachedConfigs?.updatedAt,
  });
  const modelConfigOptions = (modelConfigs.data ?? []).map((config) => ({
    value: config.id,
    label: config.name,
  }));

  useEffect(() => {
    if (modelConfigs.data) {
      writeCachedQuery(
        `model-configs:${workspaceId}`,
        modelConfigs.data,
        modelConfigs.dataUpdatedAt || Date.now(),
      );
    }
  }, [modelConfigs.data, modelConfigs.dataUpdatedAt, workspaceId]);

  useEffect(() => {
    onCountChange?.((allSources.data ?? []).length);
  }, [allSources.data, onCountChange]);

  const profileVersionByConfigId = useMemo(
    () => new Map((modelConfigs.data ?? []).map((config) => [config.id, numericVersion(config.retrieval_profile_version) ?? 1])),
    [modelConfigs.data],
  );

  const staleSourceIds = useMemo(() => {
    const stale = new Set<string>();
    for (const source of allSources.data ?? []) {
      const metadata = source.metadata as Record<string, unknown> | undefined;
      const modelConfigId = typeof metadata?.model_config_id === 'string' ? metadata.model_config_id : null;
      if (!modelConfigId) continue;
      const expectedVersion = profileVersionByConfigId.get(modelConfigId);
      if (!expectedVersion) continue;
      const indexedVersion = numericVersion(metadata?.indexed_profile_version) ?? numericVersion(metadata?.retrieval_profile_version);
      if (indexedVersion === null) continue;
      if (indexedVersion < expectedVersion) stale.add(source.id);
    }
    return stale;
  }, [allSources.data, profileVersionByConfigId]);

  const createSource = useMutation({
    mutationFn: () =>
      api.createSource(token!, workspaceId, entityId, {
        source_type: sourceType,
        display_name: displayName,
        source_url: sourceType === 'url' ? sourceUrl : undefined,
        raw_text: sourceType === 'text' ? rawText : undefined,
        visibility,
        model_config_id: sourceModelConfigId || undefined,
      }),
    onSuccess: () => {
      toast.success('Source created');
      setDisplayName('');
      setSourceUrl('');
      setRawText('');
      setSourceModelConfigId('');
      setSourceOpen(false);
      setAddMenuOpen(false);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const upload = useMutation({
    mutationFn: async () => {
      const files = uploadFiles;
      const modelConfigId = uploadModelConfigId || undefined;
      const results: DataSource[] = [];
      for (const file of files) {
        const initialized = await api.initUploadSource(token!, workspaceId, entityId, {
          file_name: file.name,
          file_size_bytes: file.size,
          content_type: file.type || 'application/octet-stream',
          visibility,
          model_config_id: modelConfigId,
        });
        await api.postPresignedUpload(initialized.uploadUrl, file, initialized.fields);
        const created = await api.completeUploadSource(token!, workspaceId, entityId, {
          upload_id: initialized.uploadId,
          display_name: file.name,
          visibility,
          model_config_id: modelConfigId,
        });
        results.push(created);
      }
      return results;
    },
    onSuccess: (results) => {
      toast.success(results.length > 1 ? `${results.length} files uploaded and queued` : 'File uploaded and queued for ingestion');
      setUploadFiles([]);
      setUploadModelConfigId('');
      setUploadOpen(false);
      setAddMenuOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const retrySource = useMutation({
    mutationFn: (input: { sourceId: string; entityId: string }) => api.retrySource(token!, workspaceId, input.entityId, input.sourceId),
    onMutate: async (input) => {
      queryClient.setQueryData<DataSource[]>(queryKey, (current) =>
        (current ?? []).map((source) => (source.id === input.sourceId ? { ...source, status: 'pending', ingestion_jobs: [] } : source)),
      );
    },
    onSuccess: () => {
      toast.success('Re-index queued');
      setOpenActionsId(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteSource = useMutation({
    mutationFn: (input: { sourceId: string; entityId: string }) => api.deleteSource(token!, workspaceId, input.entityId, input.sourceId),
    onSuccess: () => {
      toast.success('Document and vectors deleted');
      setDeleteSingleTarget(null);
      setOpenActionsId(null);
      setSelectedSourceIds((current) => current.filter((id) => id !== deleteSingleTarget?.sourceId));
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const showSourceError = useMutation({
    mutationFn: (input: { sourceId: string; entityId: string }) => api.getSourceError(token!, workspaceId, input.entityId, input.sourceId),
    onSuccess: (details) => {
      setSourceErrorDetails(details);
      setSourceErrorOpen(true);
      setOpenActionsId(null);
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 404) toast.message('No stored ingestion error for this source yet');
      else toast.error(error.message);
      setOpenActionsId(null);
    },
  });

  const visibleSources = useMemo(
    () => (allSources.data ?? []).filter((source) => source.display_name.toLowerCase().includes(docSearch.toLowerCase())),
    [allSources.data, docSearch],
  );

  const pageSize = 10;
  const totalItems = visibleSources.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const paginatedSources = useMemo(() => visibleSources.slice(pageStart, pageEnd), [visibleSources, pageStart, pageEnd]);

  useEffect(() => {
    setCurrentPage(1);
  }, [docSearch, entityId]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const stats = useMemo(() => {
    const items = allSources.data ?? [];
    const processing = items.filter((item) => item.status === 'processing' || item.status === 'pending').length;
    const totalBytes = items.reduce((sum, item) => sum + sourceSizeBytes(item), 0);
    const latestTimestamp = items
      .map((item) => {
        const maybeUpdated = (item as DataSource & { updated_at?: string }).updated_at;
        const candidate = maybeUpdated ?? item.created_at;
        const parsed = Date.parse(candidate);
        return Number.isFinite(parsed) ? parsed : null;
      })
      .filter((value): value is number => value !== null)
      .sort((a, b) => b - a)[0];
    return {
      totalFiles: items.length,
      processing,
      totalSize: formatBytes(totalBytes),
      lastSync: processing > 0 ? 'Syncing...' : latestTimestamp ? formatDistanceToNow(new Date(latestTimestamp), { addSuffix: true }) : '-',
    };
  }, [allSources.data]);

  function onSubmitSource(event: FormEvent) {
    event.preventDefault();
    if (!sourceModelConfigId) {
      toast.error('Select model config for ingestion');
      return;
    }
    createSource.mutate();
  }

  function onSubmitUpload(event: FormEvent) {
    event.preventDefault();
    if (uploadFiles.length === 0) {
      toast.error('Pick at least one file');
      return;
    }
    if (!uploadModelConfigId) {
      toast.error('Select model config for ingestion');
      return;
    }
    upload.mutate();
  }

  function toggleSourceSelection(sourceId: string) {
    setSelectedSourceIds((current) => (current.includes(sourceId) ? current.filter((id) => id !== sourceId) : [...current, sourceId]));
  }

  const selectedSourcesForDelete = useMemo(() => {
    const selectedSet = new Set(selectedSourceIds);
    return (allSources.data ?? []).filter((source) => selectedSet.has(source.id));
  }, [allSources.data, selectedSourceIds]);

  function onConfirmDeleteSelected() {
    if (selectedSourcesForDelete.length === 0) return;
    setDeleteBatchPending(true);
    Promise.all(selectedSourcesForDelete.map((source) => api.deleteSource(token!, workspaceId, source.entity_id, source.id)))
      .then(() => {
        toast.success('Selected documents deleted');
        setSelectedSourceIds([]);
        setDeleteBatchOpen(false);
        queryClient.invalidateQueries({ queryKey });
      })
      .catch((error: Error) => toast.error(error.message))
      .finally(() => setDeleteBatchPending(false));
  }

  function openAddKind(kind: 'upload' | 'text' | 'url') {
    setAddMenuOpen(false);
    if (kind === 'upload') setUploadOpen(true);
    else {
      setSourceType(kind);
      setSourceOpen(true);
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
    setUploadFiles(files);
    setUploadOpen(true);
  }

  return (
    <div
      className={`entity-docs${dragOver ? ' is-dragover' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="entity-docs-stats">
        <span><strong>{stats.totalFiles}</strong> files</span>
        <span className="sep">·</span>
        <span>{stats.totalSize}</span>
        <span className="sep">·</span>
        <span className={stats.processing > 0 ? 'syncing' : ''}>{stats.processing > 0 ? `${stats.processing} syncing` : stats.lastSync}</span>
      </div>

      <div className="entity-docs-toolbar">
        <input
          className="entity-docs-search"
          placeholder={`Search in ${entityName}...`}
          value={docSearch}
          onChange={(e) => setDocSearch(e.target.value)}
        />
        <div className="entity-docs-add-wrap">
          <button type="button" className="entity-docs-add" onClick={() => setAddMenuOpen((v) => !v)} aria-expanded={addMenuOpen}>
            <Upload size={13} /> Add <ChevronDown size={12} />
          </button>
          {addMenuOpen ? (
            <div className="entity-docs-menu" role="menu" ref={flipMenuIfClipped}>
              <button type="button" onClick={() => openAddKind('upload')}><FileUp size={13} /> Upload files</button>
              <button type="button" onClick={() => openAddKind('text')}><Type size={13} /> Add text</button>
              <button type="button" onClick={() => openAddKind('url')}><Link2 size={13} /> Add URL</button>
            </div>
          ) : null}
        </div>
      </div>

      {selectedSourceIds.length > 0 ? (
        <div className="entity-docs-bulk">
          <span>{selectedSourceIds.length} selected</span>
          <button type="button" onClick={() => setDeleteBatchOpen(true)}><Trash2 size={12} /> Delete</button>
          <button type="button" className="ghost" onClick={() => setSelectedSourceIds([])}><X size={12} /> Clear</button>
        </div>
      ) : null}

      <div className="entity-docs-list">
        {allSources.isLoading ? (
          <SkeletonRows count={3} height={52} />
        ) : visibleSources.length === 0 ? (
          <div
            className="entity-docs-empty"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDrop={handleDrop}
          >
            <FileUp size={18} />
            <p>{docSearch ? 'No documents match your search.' : `No documents in ${entityName} yet.`}</p>
            {!docSearch ? <span>Drag files here, or use Add to upload, paste text, add URL.</span> : null}
            {!docSearch ? (
              <div className="entity-docs-empty-actions">
                <button type="button" onClick={() => openAddKind('upload')}>Upload</button>
                <button type="button" onClick={() => openAddKind('text')}>Text</button>
                <button type="button" onClick={() => openAddKind('url')}>URL</button>
              </div>
            ) : null}
          </div>
        ) : (
          paginatedSources.map((source) => (
            <article key={source.id} className={`entity-docs-row status-${source.status}`}>
              <input type="checkbox" checked={selectedSourceIds.includes(source.id)} onChange={() => toggleSourceSelection(source.id)} aria-label={`Select ${source.display_name}`} />
              <div className="entity-docs-row-main">
                <div className="entity-docs-row-top">
                  <span className="entity-docs-type">{sourceIcon(source.source_type)}</span>
                  <span className="entity-docs-name" title={source.display_name}>{source.display_name}</span>
                </div>
                <div className="entity-docs-row-meta">
                  <span>{formatFileSize(source)}</span>
                  <span>·</span>
                  <span>{format(new Date(source.created_at), 'MMM dd, yyyy')}</span>
                  <span className={`entity-docs-status status-${source.status}`}>
                    {source.status === 'completed' ? <Check size={10} /> : null}
                    {source.status === 'failed' ? <AlertTriangle size={10} /> : null}
                    {source.status.toUpperCase()}
                  </span>
                  {staleSourceIds.has(source.id) ? <span className="entity-docs-stale">STALE</span> : null}
                </div>
              </div>
              <div className="entity-docs-row-actions">
                <button type="button" className="entity-docs-kebab" onClick={() => setOpenActionsId((c) => (c === source.id ? null : source.id))} aria-expanded={openActionsId === source.id}>
                  <ChevronDown size={13} />
                </button>
                {openActionsId === source.id ? (
                  <div className="entity-docs-menu inline" role="menu" ref={flipMenuIfClipped}>
                    <button type="button" onClick={() => retrySource.mutate({ sourceId: source.id, entityId: source.entity_id })} disabled={source.status !== 'failed' || retrySource.isPending}>
                      Retry analysis
                    </button>
                    <button type="button" onClick={() => showSourceError.mutate({ sourceId: source.id, entityId: source.entity_id })} disabled={source.status !== 'failed' || showSourceError.isPending}>
                      Show error
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={deleteSource.isPending || source.status === 'processing'}
                      onClick={() => {
                        setOpenActionsId(null);
                        setDeleteSingleTarget({ sourceId: source.id, entityId: source.entity_id, displayName: source.display_name });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>

      {totalPages > 1 ? (
        <footer className="entity-docs-pager">
          <span>{pageStart + 1}–{Math.min(pageEnd, totalItems)} of {totalItems}</span>
          <div>
            <button type="button" disabled={safeCurrentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>Prev</button>
            <button type="button" disabled={safeCurrentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        </footer>
      ) : null}

      <Modal open={sourceOpen} title={sourceType === 'url' ? `Add URL to ${entityName}` : `Add text to ${entityName}`} onOpenChange={setSourceOpen} disableClose={createSource.isPending}>
        <form className="layerum-stack" onSubmit={onSubmitSource}>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Display Name</label>
            <input className="layerum-input" placeholder="Product Notes - Q1" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Source Type</label>
            <Select
              value={sourceType}
              onChange={(v) => setSourceType(v as 'text' | 'url')}
              options={[
                { value: 'text', label: 'Text' },
                { value: 'url', label: 'URL' },
              ]}
            />
          </div>
          {sourceType === 'url' ? (
            <div className="layerum-form-field">
              <label className="layerum-form-label">Source URL</label>
              <input className="layerum-input" placeholder="https://example.com/docs" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
            </div>
          ) : (
            <div className="layerum-form-field">
              <label className="layerum-form-label">Raw Text</label>
              <textarea className="layerum-textarea" placeholder="Paste content" value={rawText} onChange={(e) => setRawText(e.target.value)} />
            </div>
          )}
          <div className="layerum-form-field">
            <label className="layerum-form-label">Model Config</label>
            <Select
              value={sourceModelConfigId}
              onChange={setSourceModelConfigId}
              options={modelConfigOptions}
              placeholder="Select model config"
              emptyLabel="No model configs yet"
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Visibility</label>
            <Select value={visibility} onChange={(v) => setVisibility(v as 'self' | 'self_and_descendants')} options={visibilityOptions} />
          </div>
          <button className="layerum-button" type="submit" disabled={createSource.isPending}>Add source</button>
        </form>
      </Modal>

      <Modal open={uploadOpen} title={`Upload to ${entityName}`} onOpenChange={setUploadOpen} disableClose={upload.isPending}>
        <form className="layerum-stack" onSubmit={onSubmitUpload}>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Document Files</label>
            <p className="layerum-form-hint">Multi-select supported. Each file ingested separately.</p>
            <input
              ref={fileInputRef}
              className="layerum-input"
              type="file"
              multiple
              onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))}
              required={uploadFiles.length === 0}
            />
            {uploadFiles.length > 0 ? (
              <div className="entity-docs-filelist">
                {uploadFiles.map((f) => (
                  <span key={`${f.name}-${f.size}`}>{f.name} ({formatBytes(f.size)})</span>
                ))}
                <button type="button" className="ghost" onClick={() => {
                  setUploadFiles([]);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}>Clear</button>
              </div>
            ) : null}
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Model Config</label>
            <Select
              value={uploadModelConfigId}
              onChange={setUploadModelConfigId}
              options={modelConfigOptions}
              placeholder="Select model config"
              emptyLabel="No model configs yet"
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Visibility</label>
            <Select value={visibility} onChange={(v) => setVisibility(v as 'self' | 'self_and_descendants')} options={visibilityOptions} />
          </div>
          <button className="layerum-button" type="submit" disabled={upload.isPending}>
            {upload.isPending ? 'Uploading...' : uploadFiles.length > 1 ? `Upload ${uploadFiles.length} files` : 'Upload and index'}
          </button>
        </form>
      </Modal>

      <ConfirmDestructiveModal
        open={Boolean(deleteSingleTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteSingleTarget(null);
        }}
        title="Delete Document"
        description={deleteSingleTarget ? (<>Delete <strong>{deleteSingleTarget.displayName}</strong> and all its vectors.</>) : 'This action is irreversible.'}
        confirmLabel="Delete document"
        isPending={deleteSource.isPending}
        onConfirm={() => {
          if (!deleteSingleTarget) return;
          deleteSource.mutate({ sourceId: deleteSingleTarget.sourceId, entityId: deleteSingleTarget.entityId });
        }}
      />

      <ConfirmDestructiveModal
        open={deleteBatchOpen}
        onOpenChange={(open) => {
          if (deleteBatchPending) return;
          setDeleteBatchOpen(open);
        }}
        title="Delete Selected Documents"
        description={<>Delete <strong>{selectedSourcesForDelete.length}</strong> selected document(s) and their vectors.</>}
        confirmLabel="Delete selected"
        isPending={deleteBatchPending}
        onConfirm={onConfirmDeleteSelected}
      />

      <Modal open={sourceErrorOpen} title="Ingestion Error Details" onOpenChange={setSourceErrorOpen}>
        {sourceErrorDetails ? (
          <div className="ingestion-error-modal">
            <div className="ingestion-error-meta">
              <div className="ingestion-error-stat">
                <span>Source status</span>
                <strong className={`tone-${statusTone(sourceErrorDetails.status)}`}>{statusLabel(sourceErrorDetails.status)}</strong>
              </div>
              <div className="ingestion-error-stat">
                <span>Job status</span>
                <strong className={`tone-${statusTone(sourceErrorDetails.latestJob.status)}`}>{statusLabel(sourceErrorDetails.latestJob.status)}</strong>
              </div>
            </div>
            <div className="ingestion-error-section">
              <span className="ingestion-error-label">Error message</span>
              <div className="ingestion-error-value">{sourceErrorDetails.latestJob.error_message ?? 'No error message stored.'}</div>
            </div>
            <button className="layerum-button ghost" type="button" onClick={() => setSourceErrorOpen(false)}>Close</button>
          </div>
        ) : (
          <div className="layerum-empty">No source error details loaded.</div>
        )}
      </Modal>
    </div>
  );
}
