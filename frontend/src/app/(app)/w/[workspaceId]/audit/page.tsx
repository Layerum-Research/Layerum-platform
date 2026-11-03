'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { WorkspaceTopbar } from '@/components/workspace-topbar';
import { WorkspaceAccessGate, useWorkspaceAccess } from '@/components/workspace-access';
import { getAuditStatus, getAuditSubject, getAuditUser } from '@/lib/audit-log-utils';
import { SkeletonRows } from '@/components/loader';
import { TablePagination } from '@/components/table-pagination';
import './audit-page.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400'],
});

export default function AuditPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { session } = useAuth();
  const token = session?.access_token;
  const { workspaceId } = use(params);
  const access = useWorkspaceAccess();
  const canViewAudit = access.can({ type: 'permission', permission: 'audit.read' });

  const [actionFilter, setActionFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | '30d'>('24h');
  const [liveRefresh, setLiveRefresh] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const logs = useQuery({
    queryKey: ['audit', workspaceId],
    queryFn: () => api.auditLogs(token!, workspaceId),
    enabled: Boolean(token && canViewAudit),
    placeholderData: keepPreviousData,
    refetchInterval: liveRefresh ? 10000 : false,
  });

  const actionOptions = useMemo(() => {
    const list = Array.from(new Set((logs.data ?? []).map((log) => log.action))).sort();
    return ['all', ...list];
  }, [logs.data]);

  const userOptions = useMemo(() => {
    const list = Array.from(new Set((logs.data ?? []).map((log) => getAuditUser(log)))).sort();
    return ['all', ...list];
  }, [logs.data]);

  const filtered = useMemo(() => {
    const base = logs.data ?? [];
    const now = logs.dataUpdatedAt || 0;
    const cutoffMs = timeFilter === '24h' ? 24 * 60 * 60 * 1000 : timeFilter === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    const query = search.trim().toLowerCase();

    return base.filter((log) => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      const user = getAuditUser(log);
      if (userFilter !== 'all' && user !== userFilter) return false;
      const created = new Date(log.created_at).getTime();
      if (Number.isNaN(created)) return false;
      if (now - created > cutoffMs) return false;

      if (!query) return true;
      const subject = getAuditSubject(log).toLowerCase();
      const action = log.action.toLowerCase();
      const status = getAuditStatus(log);
      return (
        user.toLowerCase().includes(query) ||
        subject.includes(query) ||
        action.includes(query) ||
        status.includes(query)
      );
    });
  }, [actionFilter, logs.data, logs.dataUpdatedAt, search, timeFilter, userFilter]);

  const pageSize = 50;
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const paginatedLogs = useMemo(
    () => filtered.slice(pageStart, pageEnd),
    [filtered, pageStart, pageEnd],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [actionFilter, userFilter, timeFilter, search]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function exportCsv() {
    const rows = filtered.map((log) => ({
      timestamp: format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
      user: getAuditUser(log),
      action: log.action,
      subject: getAuditSubject(log),
      status: getAuditStatus(log),
    }));
    const header = 'timestamp,user,action,subject,status\n';
    const body = rows
      .map((row) => {
        const values = [row.timestamp, row.user, row.action, row.subject, row.status];
        return values
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',');
      })
      .join('\n');

    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${workspaceId}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={`layerum-page audit-page ${inter.className}`}>
      <WorkspaceTopbar
        section="Workspace"
        page="Audit Log"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search audit events..."
      />
      <WorkspaceAccessGate
        requirement={{ type: 'permission', permission: 'audit.read' }}
        title="Audit access required"
        description="You need the Read audit logs permission to view this page."
      >
        <section className="audit-head-wrap">
          <header className="audit-header">
            <div>
              <h1>Audit Log</h1>
              <p>Review and track workspace activity across the organization.</p>
            </div>
            <div className="audit-header-actions">
              <button type="button" className="ghost" onClick={exportCsv}>
                <Download size={12} />
                Export CSV
              </button>
              <button type="button" className={`live${liveRefresh ? ' on' : ''}`} onClick={() => setLiveRefresh((value) => !value)}>
                <RefreshCw size={12} />
                Live Refresh
              </button>
            </div>
          </header>

          <div className="audit-filters">
            <label>
              <span>ACTION TYPE:</span>
              <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
                <option value="all">All Actions</option>
                {actionOptions.filter((value) => value !== 'all').map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>USER:</span>
              <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)}>
                <option value="all">All Users</option>
                {userOptions.filter((value) => value !== 'all').map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>TIME RANGE:</span>
              <select value={timeFilter} onChange={(event) => setTimeFilter(event.target.value as '24h' | '7d' | '30d')}>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
            </label>

            <button
              type="button"
              className="clear"
              onClick={() => {
                setActionFilter('all');
                setUserFilter('all');
                setTimeFilter('24h');
              }}
            >
              Clear all filters
            </button>
          </div>
        </section>

        <section className="audit-table-shell">
          <div className="audit-table-head">
            <span>TIMESTAMP</span>
            <span>USER</span>
            <span>ACTION</span>
            <span>SUBJECT</span>
            <span>STATUS</span>
          </div>

          <div className="audit-table-body">
            {paginatedLogs.map((log) => {
              const user = getAuditUser(log);
              const status = getAuditStatus(log);
              const initials = user.slice(0, 2).toUpperCase();
              return (
                <div className="audit-row" key={log.id}>
                  <span className={mono.className}>{format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss')}</span>
                  <span className="user-cell">
                    <i>{initials}</i>
                    <em>{user}</em>
                  </span>
                  <span>
                    <u className={status === 'failed' ? 'failed' : ''}>{log.action}</u>
                  </span>
                  <span className={mono.className}>{getAuditSubject(log)}</span>
                  <span className={`status ${status}`}>
                    <b />
                    {status === 'failed' ? 'Failed' : 'Success'}
                  </span>
                </div>
              );
            })}
            {logs.isLoading ? <SkeletonRows count={5} height={44} /> : null}
            {!logs.isLoading && filtered.length === 0 ? <div className="audit-empty">No audit events for selected filters.</div> : null}
          </div>

          <TablePagination

            currentPage={safeCurrentPage}

            totalPages={totalPages}

            pageStart={pageStart}

            pageEnd={pageEnd}

            totalItems={totalItems}

            itemLabel="entries"

            onPageChange={setCurrentPage}

          />
        </section>
      </WorkspaceAccessGate>
    </div>
  );
}
