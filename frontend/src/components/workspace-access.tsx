'use client';

import { createContext, useContext, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import type { WorkspaceMember, WorkspaceRolePermission } from '@/lib/types';
import {
  canAccessWorkspaceRequirement,
  resolveWorkspacePermissions,
  type WorkspaceAccessRequirement,
} from '@/lib/workspace-access';
import './workspace-access.css';

type WorkspaceAccessContextValue = {
  loading: boolean;
  member: WorkspaceMember | null;
  permissions: WorkspaceRolePermission[];
  can: (requirement: WorkspaceAccessRequirement) => boolean;
};

const WorkspaceAccessContext = createContext<WorkspaceAccessContextValue | null>(null);

type WorkspaceMembersCacheEntry = {
  updatedAt: number;
  data: WorkspaceMember[];
};

const WORKSPACE_MEMBERS_CACHE_PREFIX = 'layerum:workspace-members:v1';
const WORKSPACE_MEMBERS_STALE_TIME = 10 * 60 * 1000;

function getWorkspaceMembersCacheKey(workspaceId: string, userId: string) {
  return `${WORKSPACE_MEMBERS_CACHE_PREFIX}:${userId}:${workspaceId}`;
}

function readWorkspaceMembersCache(workspaceId: string, userId?: string | null) {
  if (typeof window === 'undefined' || !userId) return null;
  const raw = window.sessionStorage.getItem(getWorkspaceMembersCacheKey(workspaceId, userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceMembersCacheEntry>;
    if (!Array.isArray(parsed.data) || typeof parsed.updatedAt !== 'number') return null;
    return parsed as WorkspaceMembersCacheEntry;
  } catch {
    return null;
  }
}

function writeWorkspaceMembersCache(
  workspaceId: string,
  userId: string,
  data: WorkspaceMember[],
  updatedAt: number,
) {
  if (typeof window === 'undefined') return;
  const payload: WorkspaceMembersCacheEntry = { data, updatedAt };
  window.sessionStorage.setItem(getWorkspaceMembersCacheKey(workspaceId, userId), JSON.stringify(payload));
}

export function WorkspaceAccessProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: React.ReactNode;
}) {
  const { session, user } = useAuth();
  const token = session?.access_token;
  const cache = useMemo(
    () => readWorkspaceMembersCache(workspaceId, user?.id),
    [workspaceId, user?.id],
  );

  const members = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api.getWorkspaceMembers(token!, workspaceId),
    enabled: Boolean(token && workspaceId),
    staleTime: WORKSPACE_MEMBERS_STALE_TIME,
    initialData: cache?.data,
    initialDataUpdatedAt: cache?.updatedAt,
  });

  useEffect(() => {
    if (!user?.id || !members.data) return;
    writeWorkspaceMembersCache(
      workspaceId,
      user.id,
      members.data,
      members.dataUpdatedAt || Date.now(),
    );
  }, [members.data, members.dataUpdatedAt, workspaceId, user?.id]);

  const member = useMemo(
    () => (members.data ?? []).find((item) => item.user.id === user?.id) ?? null,
    [members.data, user?.id],
  );

  const permissions = useMemo(() => resolveWorkspacePermissions(member), [member]);

  const value = useMemo<WorkspaceAccessContextValue>(
    () => ({
      loading: members.isLoading,
      member,
      permissions,
      can: (requirement) => canAccessWorkspaceRequirement(member, requirement),
    }),
    [member, members.isLoading, permissions],
  );

  return (
    <WorkspaceAccessContext.Provider value={value}>
      {children}
    </WorkspaceAccessContext.Provider>
  );
}

export function useWorkspaceAccess() {
  const ctx = useContext(WorkspaceAccessContext);
  if (!ctx) {
    throw new Error('useWorkspaceAccess must be used inside WorkspaceAccessProvider');
  }
  return ctx;
}

export function useWorkspaceAccessOptional() {
  return useContext(WorkspaceAccessContext);
}

export function WorkspaceAccessGate({
  requirement,
  title,
  description,
  children,
}: {
  requirement: WorkspaceAccessRequirement;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const access = useWorkspaceAccess();

  if (access.loading) {
    return (
      <section className="workspace-access-state workspace-access-loading" aria-busy="true" aria-live="polite">
        <div className="workspace-access-skeleton">
          <span className="line line-title" />
          <span className="line line-body" />
          <span className="line line-body short" />
        </div>
      </section>
    );
  }

  if (!access.can(requirement)) {
    return (
      <section className="workspace-access-state">
        <h2>{title}</h2>
        <p>{description}</p>
      </section>
    );
  }

  return children;
}
