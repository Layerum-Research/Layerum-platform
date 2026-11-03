'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Archive,
  FolderOpen,
  Plus,
  ServerCog,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { Modal } from '@/components/modal';
import { ConfirmDestructiveModal } from '@/components/confirm-destructive-modal';
import { WorkspaceTopbar } from '@/components/workspace-topbar';
import './workspaces-page.css';

const LAST_WORKSPACE_KEY = 'layerum:last_workspace_id';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
});

function toSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function formatStorage(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 GB';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
  if (gb >= 10) return `${gb.toFixed(0)} GB`;
  return `${gb.toFixed(1)} GB`;
}

export default function WorkspacesPage() {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [lastWorkspaceId, setLastWorkspaceId] = useState<string | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<{ id: string; name: string } | null>(null);

  const workspacesOverview = useQuery({
    queryKey: ['workspaces-overview'],
    queryFn: () => api.workspacesOverview(token!),
    enabled: Boolean(token),
  });

  const createWorkspace = useMutation({
    mutationFn: (payload: { name: string; slug: string }) => api.createWorkspace(token!, payload),
    onSuccess: () => {
      toast.success('Workspace created');
      queryClient.invalidateQueries({ queryKey: ['workspaces-overview'] });
      setName('');
      setSlug('');
      setCreateOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteWorkspace = useMutation({
    mutationFn: (workspaceId: string) => api.deleteWorkspace(token!, workspaceId),
    onSuccess: (_, workspaceId) => {
      if (lastWorkspaceId === workspaceId && typeof window !== 'undefined') {
        window.localStorage.removeItem(LAST_WORKSPACE_KEY);
        setLastWorkspaceId(null);
      }
      toast.success('Workspace deleted');
      queryClient.invalidateQueries({ queryKey: ['workspaces-overview'] });
      setWorkspaceToDelete(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setLastWorkspaceId(window.localStorage.getItem(LAST_WORKSPACE_KEY));
  }, []);

  const readySlug = useMemo(() => slug || toSlug(name), [slug, name]);
  const workspaceItems = useMemo(
    () => workspacesOverview.data?.items ?? [],
    [workspacesOverview.data?.items],
  );
  const filteredWorkspaces = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = workspaceItems.filter((item) => {
      if (!q) return true;
      return (
        item.workspace.name.toLowerCase().includes(q) ||
        item.workspace.slug.toLowerCase().includes(q)
      );
    });
    if (!lastWorkspaceId) return items;

    const lastUsedIndex = items.findIndex((item) => item.workspace.id === lastWorkspaceId);
    if (lastUsedIndex <= 0) return items;

    const reordered = [...items];
    const [lastUsed] = reordered.splice(lastUsedIndex, 1);
    reordered.unshift(lastUsed);
    return reordered;
  }, [workspaceItems, search, lastWorkspaceId]);

  const primary = filteredWorkspaces[0];
  const secondary = filteredWorkspaces[1];
  const tertiary = filteredWorkspaces[2];
  const quaternary = filteredWorkspaces[3];
  const extraWorkspaces = filteredWorkspaces.slice(4);

  function rememberWorkspace(workspaceId: string) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId);
    setLastWorkspaceId(workspaceId);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    createWorkspace.mutate({ name, slug: readySlug });
  }

  function renderDeleteButton(workspaceId: string, workspaceName: string) {
    return (
      <button
        type="button"
        className="workspace-delete-button"
        aria-label={`Delete ${workspaceName}`}
        onClick={() => setWorkspaceToDelete({ id: workspaceId, name: workspaceName })}
      >
        <Trash2 size={14} />
      </button>
    );
  }

  function formatWorkspaceUsage(item: (typeof workspaceItems)[number]) {
    const used = formatStorage(item.metrics.usedBytes);
    if (!item.isOwner || !item.metrics.capacityBytes) return `${used} used`;
    return `${used} / ${formatStorage(item.metrics.capacityBytes)}`;
  }

  return (
    <main className={`layerum-page workspaces-page ${inter.className}`}>
      <WorkspaceTopbar
        section="Workspace Hub"
        page="Workspaces"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Filter workspaces..."
      />
      <div className="workspaces-content">
        <section className="workspaces-head">
          <div>
            <h1>Workspaces</h1>
            <p>
              Create and manage isolated environments for data, models, and access control.
            </p>
          </div>
          <div className="actions">
            <button className="create" type="button" onClick={() => setCreateOpen(true)}>
              <Plus size={13} />
              New workspace
            </button>
          </div>
        </section>

        <section className="workspace-grid">
          {workspacesOverview.isLoading ? (
            <>
              <article className="card skeleton hero" />
              <article className="card skeleton side" />
              <article className="card skeleton mini" />
              <article className="card skeleton mini" />
            </>
          ) : null}

          {primary ? (
            <article className="card hero">
              <>
                {renderDeleteButton(primary.workspace.id, primary.workspace.name)}
                <div className="icon"><Sparkles size={18} /></div>
                <h2>{primary.workspace.name}</h2>
                <p>
                  Default environment for this workspace&apos;s data, models, and members.
                </p>
                <div className="meta-3">
                  <div>
                    <label>ENTITIES</label>
                    <b className={mono.className}>{primary.metrics.entities.toLocaleString()}</b>
                  </div>
                  <div>
                    <label>DATA SIZE</label>
                    <b className={mono.className}>{formatWorkspaceUsage(primary)}</b>
                  </div>
                  <div>
                    <label>MEMBERS</label>
                    <b className={mono.className}>{primary.metrics.members}</b>
                  </div>
                </div>
                <Link
                  href={`/w/${primary.workspace.id}/dashboard`}
                  onClick={() => rememberWorkspace(primary.workspace.id)}
                  className="open-link"
                >
                  Open Workspace
                </Link>
                <u>{primary.workspace.id === lastWorkspaceId ? 'LAST USED' : 'ACTIVE'}</u>
              </>
            </article>
          ) : null}

          {secondary ? (
            <article className="card side">
              <>
                {renderDeleteButton(secondary.workspace.id, secondary.workspace.name)}
                <div className="icon"><FolderOpen size={16} /></div>
                <h3>{secondary.workspace.name}</h3>
                <p>Internal testing cluster for v2 architecture prototypes.</p>
                <div className="rows">
                  <div><span>ENTITIES</span><b className={mono.className}>{secondary.metrics.entities.toLocaleString()}</b></div>
                  <div><span>MEMBERS</span><b className={mono.className}>{secondary.metrics.members}</b></div>
                  <div className="bar"><em style={{ width: `${secondary.metrics.usagePercent ?? 0}%` }} /></div>
                  <div><span>CAPACITY</span><b className={mono.className}>{formatWorkspaceUsage(secondary)}</b></div>
                </div>
                <Link href={`/w/${secondary.workspace.id}/dashboard`} onClick={() => rememberWorkspace(secondary.workspace.id)}>
                  Open
                </Link>
              </>
            </article>
          ) : null}

          {tertiary ? (
            <article className="card mini">
              <>
                {renderDeleteButton(tertiary.workspace.id, tertiary.workspace.name)}
                <div className="icon"><ServerCog size={15} /></div>
                <h3>{tertiary.workspace.name}</h3>
                <p>Regional edge node for low-latency delivery.</p>
                <dl>
                  <div><dt>SIZE</dt><dd className={mono.className}>{formatWorkspaceUsage(tertiary)}</dd></div>
                  <div><dt>MEMBERS</dt><dd className={mono.className}>{tertiary.metrics.members}</dd></div>
                  <div><dt>ENTITIES</dt><dd className={mono.className}>{tertiary.metrics.entities.toLocaleString()}</dd></div>
                </dl>
                <Link
                  href={`/w/${tertiary.workspace.id}/dashboard`}
                  onClick={() => rememberWorkspace(tertiary.workspace.id)}
                  className="open-link-mini"
                >
                  Open
                </Link>
              </>
            </article>
          ) : null}

          {quaternary ? (
            <article className="card mini">
              <>
                {renderDeleteButton(quaternary.workspace.id, quaternary.workspace.name)}
                <div className="icon"><Archive size={15} /></div>
                <h3>{quaternary.workspace.name}</h3>
                <p>Historical data snapshots and archived model weights.</p>
                <dl>
                  <div><dt>SIZE</dt><dd className={mono.className}>{formatWorkspaceUsage(quaternary)}</dd></div>
                  <div><dt>MEMBERS</dt><dd className={mono.className}>{quaternary.metrics.members}</dd></div>
                  <div><dt>ENTITIES</dt><dd className={mono.className}>{quaternary.metrics.entities.toLocaleString()}</dd></div>
                </dl>
                <Link
                  href={`/w/${quaternary.workspace.id}/dashboard`}
                  onClick={() => rememberWorkspace(quaternary.workspace.id)}
                  className="open-link-mini"
                >
                  Open
                </Link>
              </>
            </article>
          ) : null}

          {extraWorkspaces.map((item, index) => {
            const iconType = index % 3;

            return (
              <article className="card mini" key={item.workspace.id}>
                {renderDeleteButton(item.workspace.id, item.workspace.name)}
                <div className="icon">
                  {iconType === 0 ? <ServerCog size={15} /> : iconType === 1 ? <Archive size={15} /> : <FolderOpen size={15} />}
                </div>
                <h3>{item.workspace.name}</h3>
                <p>Regional edge node for low-latency delivery.</p>
                <dl>
                  <div><dt>SIZE</dt><dd className={mono.className}>{formatWorkspaceUsage(item)}</dd></div>
                  <div><dt>MEMBERS</dt><dd className={mono.className}>{item.metrics.members}</dd></div>
                  <div><dt>ENTITIES</dt><dd className={mono.className}>{item.metrics.entities.toLocaleString()}</dd></div>
                </dl>
                <Link
                  href={`/w/${item.workspace.id}/dashboard`}
                  onClick={() => rememberWorkspace(item.workspace.id)}
                  className="open-link-mini"
                >
                  Open
                </Link>
              </article>
            );
          })}

          <article className="card provision">
            <div className="plus"><Plus size={18} /></div>
            <h3>
              <button type="button" onClick={() => setCreateOpen(true)}>New workspace</button>
            </h3>
            <p>Create an isolated environment for data, models, and access control.</p>
          </article>
        </section>

        <section className="activity activity-coming-soon">
          <div className="activity-content">
            <header>
              <h2>Recent Activity</h2>
              <div />
              <Link href={primary ? `/w/${primary.workspace.id}/audit` : '/'}>VIEW ALL LOGS</Link>
            </header>

            <div className="activity-table">
              <div className="head">
                <span>WORKSPACE</span>
                <span>ACTION</span>
                <span>SUBJECT</span>
                <span>TIMESTAMP</span>
                <span>STATUS</span>
              </div>

              {(filteredWorkspaces.slice(0, 3)).map((item, index) => {
                const action = index === 0 ? 'WEIGHTS_PUSH' : index === 1 ? 'MODEL_TRAIN' : 'AUTH_REVOKE';
                const subject = index === 0 ? 'layer-alpha-v3.bin' : index === 1 ? 'test-run-499' : 'token_9x_ca';
                const status = index === 0 ? 'SUCCESS' : index === 1 ? 'RUNNING' : 'REVOKED';
                const tone = index === 2 ? 'danger' : index === 1 ? 'warn' : 'ok';
                return (
                  <div className="row" key={item.workspace.id}>
                    <span>{item.workspace.name}</span>
                    <span className={mono.className}>{action}</span>
                    <span>{subject}</span>
                    <span>{index === 0 ? '2 mins ago' : index === 1 ? '18 mins ago' : '1 hour ago'}</span>
                    <span><u className={tone}>{status}</u></span>
                  </div>
                );
              })}
              {filteredWorkspaces.length === 0 ? (
                <div className="empty">No workspaces found. Create one to see activity.</div>
              ) : null}
            </div>
          </div>
          <div className="activity-overlay">Coming soon</div>
        </section>
      </div>

      <Modal
        open={createOpen}
        title="Create Workspace"
        onOpenChange={setCreateOpen}
        disableClose={createWorkspace.isPending}
      >
        <form className="layerum-stack" onSubmit={handleSubmit}>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Workspace Name</label>
            <p className="layerum-form-hint">Display name used in the app navigation.</p>
            <input
              className="layerum-input"
              placeholder="Workspace name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Workspace Slug</label>
            <p className="layerum-form-hint">URL-safe unique identifier. Lowercase letters, numbers and dashes.</p>
            <input
              className="layerum-input"
              placeholder="workspace-slug"
              value={readySlug}
              onChange={(event) => setSlug(toSlug(event.target.value))}
              required
            />
          </div>
          <button className="layerum-button" disabled={createWorkspace.isPending} type="submit">
            {createWorkspace.isPending ? 'Creating...' : 'Create workspace'}
          </button>
        </form>
      </Modal>

      <ConfirmDestructiveModal
        open={Boolean(workspaceToDelete)}
        onOpenChange={(open) => {
          if (!open) setWorkspaceToDelete(null);
        }}
        title="Delete Workspace"
        description={
          <>
            Workspace <strong>{workspaceToDelete?.name}</strong> will be permanently deleted. This will remove all
            entities, documents, chunks, providers, models, audit logs, and storage files linked to this workspace.
          </>
        }
        confirmLabel="Delete workspace"
        isPending={deleteWorkspace.isPending}
        onConfirm={() => {
          if (!workspaceToDelete) return;
          deleteWorkspace.mutate(workspaceToDelete.id);
        }}
        requirePhrase
        phrase="DELETE"
      />
    </main>
  );
}
