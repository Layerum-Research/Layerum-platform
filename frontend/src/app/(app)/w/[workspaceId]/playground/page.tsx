'use client';

import { FormEvent, use, useMemo, useState } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BookOpenText,
  Search,
  Zap,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import type { Entity, QueryResponse } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Select } from '@/components/select';
import { WorkspaceTopbar } from '@/components/workspace-topbar';
import { WorkspaceAccessGate, useWorkspaceAccess } from '@/components/workspace-access';
import './playground-page.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400'],
});

function buildCascadeLevels(tree: Entity[], selectedPath: string[]) {
  const levels: Entity[][] = [];
  const resolvedPath: string[] = [];
  const resolvedNodes: Entity[] = [];
  let currentNodes = tree;
  let depth = 0;

  while (currentNodes.length > 0) {
    levels.push(currentNodes);
    const requestedSelection = selectedPath[depth];
    const selected =
      depth === 0
        ? currentNodes.some((node) => node.id === requestedSelection)
          ? requestedSelection
          : currentNodes[0].id
        : currentNodes.some((node) => node.id === requestedSelection)
          ? requestedSelection
          : undefined;

    if (!selected) break;
    resolvedPath.push(selected);
    const selectedNode = currentNodes.find((node) => node.id === selected);
    if (selectedNode) resolvedNodes.push(selectedNode);
    currentNodes = selectedNode?.children ?? [];
    depth += 1;
  }

  return { levels, resolvedPath, resolvedNodes };
}

export default function PlaygroundPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { session } = useAuth();
  const token = session?.access_token;
  const { workspaceId } = use(params);
  const access = useWorkspaceAccess();
  const canRunQuery = access.can({ type: 'permission', permission: 'query.run' });

  const [selectedEntityPath, setSelectedEntityPath] = useState<string[]>([]);
  const [modelConfigId, setModelConfigId] = useState('');
  const [question, setQuestion] = useState('');
  const [topK, setTopK] = useState(8);
  const [includeParents, setIncludeParents] = useState(true);
  const [debug, setDebug] = useState(true);
  const [docsSearch, setDocsSearch] = useState('');

  const entities = useQuery({
    queryKey: ['entities-tree', workspaceId],
    queryFn: () => api.listEntityTree(token!, workspaceId),
    enabled: Boolean(token && canRunQuery),
    placeholderData: keepPreviousData,
  });

  const configs = useQuery({
    queryKey: ['model-configs', workspaceId],
    queryFn: () => api.listModelConfigs(token!, workspaceId),
    enabled: Boolean(token && canRunQuery),
    placeholderData: keepPreviousData,
  });

  const cascade = useMemo(
    () => buildCascadeLevels(entities.data ?? [], selectedEntityPath),
    [entities.data, selectedEntityPath],
  );

  const entityId = cascade.resolvedPath[cascade.resolvedPath.length - 1] ?? '';
  const hasEntities = (entities.data ?? []).length > 0;

  const queryMutation = useMutation({
    mutationFn: () =>
      api.query(
        token!,
        {
          workspaceId,
          entityId,
          modelConfigId,
          query: question,
          topK,
          includeParentScopes: includeParents,
        },
        debug,
      ),
    onError: (error: Error) => toast.error(error.message),
  });

  const result = queryMutation.data as QueryResponse | undefined;
  const isRunning = queryMutation.isPending;
  const modelConfigOptions = (configs.data ?? []).map((config) => ({
    id: config.id,
    name: config.name,
  }));
  const citationMatchByChunkId = useMemo(() => {
    const citations = result?.citations ?? [];
    const scoredValues = citations
      .map((citation) => citation.matchScoreRaw)
      .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));

    if (scoredValues.length === 0) return new Map<string, number>();

    const minScore = Math.min(...scoredValues);
    const maxScore = Math.max(...scoredValues);
    const matchByChunkId = new Map<string, number>();

    for (const citation of citations) {
      const score = citation.matchScoreRaw;
      if (typeof score !== 'number' || !Number.isFinite(score)) continue;
      const normalized = maxScore > minScore ? ((score - minScore) / (maxScore - minScore)) * 100 : 100;
      matchByChunkId.set(citation.chunk_id, Math.round(normalized));
    }

    return matchByChunkId;
  }, [result?.citations]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !modelConfigId) {
      toast.error('Select entity and model config');
      return;
    }
    queryMutation.mutate();
  }

  return (
    <div className={`layerum-page playground-page ${inter.className}`}>
      <WorkspaceTopbar section="Workspace" page="Playground" />
      <WorkspaceAccessGate
        requirement={{ type: 'permission', permission: 'query.run' }}
        title="Query access required"
        description="You need the Run queries permission to use Playground."
      >
      <section className="playground-workspace">
        <aside className="playground-left">
          <header>
            <h2>Query</h2>
            <p>Configure query context.</p>
          </header>

          <form className="playground-form" onSubmit={onSubmit}>
            <div className="playground-field">
              <label>Knowledge Context</label>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What insights are available for this entity?"
                required
              />
            </div>

            <div className="layerum-form-field">
              <label className="layerum-form-label">Select Entity</label>
              <p className="layerum-form-hint">Choose entity scope.</p>
              <div className="playground-entity-cascade">
                {(cascade.levels[0] ?? []).length === 0 ? (
                  <Select
                    placement="bottom"
                    value=""
                    onChange={() => undefined}
                    options={[]}
                    placeholder="No entities available"
                    disabled
                  />
                ) : (
                  cascade.levels.map((level, depth) => (
                    <Select
                      key={`entity-layer-${depth}`}
                      placement="bottom"
                      value={cascade.resolvedPath[depth] ?? ''}
                      onChange={(value) =>
                        setSelectedEntityPath((current) => {
                          const next = current.slice(0, depth + 1);
                          next[depth] = value;
                          return next;
                        })
                      }
                      options={level.map((entity) => ({
                        value: entity.id,
                        label: entity.name,
                      }))}
                      placeholder={depth === 0 ? 'Select top layer' : `Select layer ${depth + 1}`}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="layerum-form-field">
              <label className="layerum-form-label">Inference Model</label>
              <p className="layerum-form-hint">Choose model config.</p>
              <Select
                placement="bottom"
                value={modelConfigId}
                onChange={setModelConfigId}
                options={modelConfigOptions.map((config) => ({
                  value: config.id,
                  label: config.name,
                }))}
                placeholder="Select model config"
                emptyLabel="No model configs yet"
              />
            </div>

            <div className="playground-options">
              <label>
                <span>Top K</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={topK}
                  onChange={(event) => setTopK(Number(event.target.value))}
                />
              </label>
              <label className="playground-check">
                <input
                  type="checkbox"
                  checked={includeParents}
                  onChange={(event) => setIncludeParents(event.target.checked)}
                />
                Include ancestor layers
              </label>
            </div>

            <button
              className={`playground-run${isRunning ? ' is-running' : ''}`}
              type="submit"
              disabled={isRunning || !entityId || !hasEntities || !modelConfigId}
              aria-busy={isRunning}
            >
              {isRunning ? 'Running' : 'Run Query'} <Zap size={14} />
            </button>
          </form>

          <section className="playground-debug">
            <div className="playground-debug-head">
              <h3>Debug Telemetry</h3>
              <button
                type="button"
                className={`debug-toggle ${debug ? 'on' : ''}`}
                onClick={() => setDebug((value) => !value)}
                aria-label="Toggle debug telemetry"
              >
                <b />
              </button>
            </div>
            <div className={`playground-debug-content ${mono.className}`}>
              <div>
                <span>Retrieval Latency</span>
                <strong>
                  {typeof result?.meta?.latencyMs === 'number' ? `${result.meta.latencyMs}ms` : 'N/A'}
                </strong>
              </div>
              <div>
                <span>Token Usage</span>
                <strong>{typeof result?.meta?.tokensUsed === 'number' ? result.meta.tokensUsed : 'N/A'}</strong>
              </div>
            </div>
          </section>
        </aside>

        <main className="playground-right">
          <section className={`playground-result${isRunning ? ' is-running' : ''}`}>
            <header>
              <div className="bar" />
              <h2>Result</h2>
            </header>
            {isRunning ? (
              <div className="playground-answer-loading" role="status" aria-label="Running query">
                <span />
                <span />
                <span />
              </div>
            ) : (
              <div className="playground-answer" key={queryMutation.submittedAt}>
                {result?.answer ?? 'No result yet. Run query.'}
              </div>
            )}
          </section>

          <section className="playground-citations">
            <header>
              <div className="title">
                <BookOpenText size={18} />
                <h3>Citations</h3>
              </div>
              <span>{(result?.citations ?? []).length} sources</span>
            </header>

            <label className="playground-cite-search">
              <Search size={14} />
              <input
                value={docsSearch}
                onChange={(event) => setDocsSearch(event.target.value)}
                placeholder="Search citations..."
              />
            </label>

            <div className="playground-cite-list">
              {isRunning ? (
                <div className="playground-cite-loading" aria-hidden="true">
                  <span />
                  <span />
                </div>
              ) : null}
              {(result?.citations ?? [])
                .filter((citation) =>
                  (citation.document_title ?? citation.document_id)
                    .toLowerCase()
                    .includes(docsSearch.toLowerCase()),
                )
                .map((citation) => (
                  <article key={citation.chunk_id} className="playground-cite-item">
                    <div className="head">
                      <div className="doc">
                        <span>[{citation.index}]</span>
                        <h4>{citation.document_title ?? citation.document_id.slice(0, 8)}</h4>
                      </div>
                      <strong>
                        {typeof citationMatchByChunkId.get(citation.chunk_id) === 'number'
                          ? `${citationMatchByChunkId.get(citation.chunk_id)}% MATCH`
                          : 'N/A'}
                      </strong>
                    </div>
                    <blockquote>{citation.excerpt}</blockquote>
                  </article>
                ))}
            </div>
          </section>
        </main>
      </section>
      </WorkspaceAccessGate>
    </div>
  );
}
