'use client';

import { FormEvent, use, useMemo, useState } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { ConfirmDestructiveModal } from '@/components/confirm-destructive-modal';
import type { WorkspaceInvite, WorkspaceMember, WorkspaceRolePermission } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Modal } from '@/components/modal';
import { Select } from '@/components/select';
import { UserAvatar } from '@/components/user-avatar';
import { WorkspaceTopbar } from '@/components/workspace-topbar';
import { WorkspaceAccessGate, useWorkspaceAccess } from '@/components/workspace-access';
import { SkeletonRows } from '@/components/loader';
import './access-page.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400'],
});

const PERMISSION_OPTIONS: Array<{ value: WorkspaceRolePermission; label: string }> = [
  { value: 'members.manage', label: 'Manage members' },
  { value: 'providers.manage', label: 'Manage providers' },
  { value: 'models.manage', label: 'Manage models' },
  { value: 'data.manage', label: 'Manage data sources' },
  { value: 'query.run', label: 'Run queries' },
  { value: 'api_keys.manage', label: 'Manage API keys' },
  { value: 'audit.read', label: 'Read audit logs' },
];

function mapMemberRole(member: WorkspaceMember) {
  if (member.isOwner || member.role === 'owner') return { label: 'Owner', tone: 'owner' as const };
  const roleName = member.roleDefinition?.name?.trim();
  const permissions = member.roleDefinition?.permissions ?? [];
  if (permissions.includes('members.manage')) return { label: roleName || 'Admin', tone: 'admin' as const };
  if (permissions.length === 1 && permissions.includes('query.run')) {
    return { label: roleName || 'Scoped', tone: 'scoped' as const };
  }
  return { label: roleName || 'Member', tone: 'member' as const };
}

function lastActive(value?: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const diffHours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
  if (diffHours <= 0) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffHours < 48) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AccessPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { session } = useAuth();
  const token = session?.access_token;
  const { workspaceId } = use(params);
  const access = useWorkspaceAccess();
  const canManageMembers = access.can({ type: 'permission', permission: 'members.manage' });
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [rolePermissions, setRolePermissions] = useState<WorkspaceRolePermission[]>([]);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<{ id: string; name: string } | null>(null);
  const [revokeInviteTarget, setRevokeInviteTarget] = useState<{ id: string; email: string } | null>(null);

  const members = useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => api.getWorkspaceMembers(token!, workspaceId),
    enabled: Boolean(token && canManageMembers),
    placeholderData: keepPreviousData,
  });
  const roles = useQuery({
    queryKey: ['workspace-roles', workspaceId],
    queryFn: () => api.listWorkspaceRoles(token!, workspaceId),
    enabled: Boolean(token && canManageMembers),
    placeholderData: keepPreviousData,
  });
  const invites = useQuery({
    queryKey: ['workspace-invites', workspaceId],
    queryFn: () => api.listWorkspaceInvites(token!, workspaceId),
    enabled: Boolean(token && canManageMembers),
    placeholderData: keepPreviousData,
  });

  const effectiveRoleId = roleId || roles.data?.[0]?.id || '';
  const hasNoRoles = roles.isSuccess && roles.data.length === 0;

  const invite = useMutation({
    mutationFn: () => api.inviteMember(token!, workspaceId, { email, roleId: effectiveRoleId }),
    onSuccess: () => {
      toast.success('Invite created');
      setEmail('');
      setRoleId('');
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-invites', workspaceId] });
      setInviteOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => api.removeMember(token!, workspaceId, userId),
    onSuccess: () => {
      toast.success('Member removed');
      setRemoveMemberTarget(null);
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const createRole = useMutation({
    mutationFn: () =>
      api.createWorkspaceRole(token!, workspaceId, {
        name: roleName,
        description: roleDescription || undefined,
        permissions: rolePermissions,
      }),
    onSuccess: () => {
      toast.success('Role created');
      resetRoleForm();
      setRoleModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-roles', workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const updateRole = useMutation({
    mutationFn: () =>
      api.updateWorkspaceRole(token!, workspaceId, editingRoleId!, {
        name: roleName,
        description: roleDescription || undefined,
        permissions: rolePermissions,
      }),
    onSuccess: () => {
      toast.success('Role updated');
      resetRoleForm();
      setRoleModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-roles', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteRole = useMutation({
    mutationFn: (id: string) => api.deleteWorkspaceRole(token!, workspaceId, id),
    onSuccess: () => {
      toast.success('Role deleted');
      setDeleteRoleTarget(null);
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-roles', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const revokeInvite = useMutation({
    mutationFn: (inviteId: string) =>
      api.revokeWorkspaceInvite(token!, workspaceId, inviteId),
    onSuccess: () => {
      toast.success('Invite revoked');
      setRevokeInviteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['workspace-invites', workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const resendInvite = useMutation({
    mutationFn: (inviteId: string) =>
      api.resendWorkspaceInvite(token!, workspaceId, inviteId),
    onSuccess: () => {
      toast.success('Invite resent');
      queryClient.invalidateQueries({ queryKey: ['workspace-invites', workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!effectiveRoleId) {
      toast.error('Select role');
      return;
    }
    invite.mutate();
  }
  function togglePermission(permission: WorkspaceRolePermission) {
    setRolePermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  }
  function resetRoleForm() {
    setEditingRoleId(null);
    setRoleName('');
    setRoleDescription('');
    setRolePermissions([]);
  }
  function openCreateRoleModal() {
    resetRoleForm();
    setRoleModalOpen(true);
  }
  function openEditRoleModal(roleToEdit: {
    id: string;
    name: string;
    description?: string | null;
    permissions: WorkspaceRolePermission[];
  }) {
    setEditingRoleId(roleToEdit.id);
    setRoleName(roleToEdit.name);
    setRoleDescription(roleToEdit.description ?? '');
    setRolePermissions(roleToEdit.permissions);
    setRoleModalOpen(true);
  }
  function onSubmitRole(event: FormEvent) {
    event.preventDefault();
    if (rolePermissions.length === 0) {
      toast.error('Select at least one permission');
      return;
    }
    if (editingRoleId) {
      updateRole.mutate();
      return;
    }
    createRole.mutate();
  }

  const allMembers = useMemo(() => members.data ?? [], [members.data]);
  const allInvites = useMemo(() => invites.data ?? [], [invites.data]);
  const roleNameById = useMemo(
    () => new Map((roles.data ?? []).map((role) => [role.id, role.name])),
    [roles.data],
  );
  type MemberTableRow =
    | {
        kind: 'active';
        key: string;
        fullName: string;
        email: string;
        roleLabel: string;
        roleTone: 'owner' | 'admin' | 'member' | 'scoped';
        lastLabel: string;
        member: WorkspaceMember;
        createdAtMs: number;
      }
    | {
        kind: 'pending';
        key: string;
        fullName: string;
        email: string;
        roleLabel: string;
        roleTone: 'pending';
        lastLabel: string;
        invite: WorkspaceInvite;
        createdAtMs: number;
      };

  const memberRows = useMemo<MemberTableRow[]>(() => {
    const pendingRows: MemberTableRow[] = allInvites.map((invite) => {
      const fullName = invite.email.split('@')[0] || invite.email;
      const createdAtMs = Date.parse(invite.created_at);
      return {
        kind: 'pending',
        key: `pending:${invite.id}`,
        fullName,
        email: invite.email,
        roleLabel: roleNameById.get(invite.role_id) ?? 'Pending role',
        roleTone: 'pending',
        lastLabel: `Invited ${lastActive(invite.created_at)}`,
        invite,
        createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
      };
    });
    pendingRows.sort((a, b) => b.createdAtMs - a.createdAtMs);

    const activeRows: MemberTableRow[] = allMembers.map((member) => {
      const roleMeta = mapMemberRole(member);
      const fullName = member.user.full_name?.trim() || member.user.email.split('@')[0];
      const createdAtMs = Date.parse(member.created_at);
      return {
        kind: 'active',
        key: `active:${member.id}`,
        fullName,
        email: member.user.email,
        roleLabel: roleMeta.label,
        roleTone: roleMeta.tone,
        lastLabel: lastActive(member.last_seen_at),
        member,
        createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
      };
    });

    return [...pendingRows, ...activeRows];
  }, [allInvites, allMembers, roleNameById]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return memberRows;
    return memberRows.filter((row) => {
      const fullName = row.fullName.toLowerCase();
      const emailValue = row.email.toLowerCase();
      const roleValue = row.roleLabel.toLowerCase();
      const status = row.kind === 'pending' ? 'pending' : 'member';
      return (
        fullName.includes(q) ||
        emailValue.includes(q) ||
        roleValue.includes(q) ||
        status.includes(q)
      );
    });
  }, [memberRows, search]);

  const pendingInvitesCount = allInvites.length;
  const expiringSoonCount = allInvites.filter((invite) => {
    const expiresAt = Date.parse(invite.expires_at);
    if (!Number.isFinite(expiresAt)) return false;
    const now = Date.now();
    return expiresAt > now && expiresAt <= now + 72 * 60 * 60 * 1000;
  }).length;
  const mfaEnabledCount = allMembers.filter((member) => member.mfa_enabled).length;
  const mfaCoverage = allMembers.length
    ? Math.round((mfaEnabledCount / allMembers.length) * 100)
    : 0;
  const membersAddedThisMonth = allMembers.filter((member) => {
    const created = Date.parse(member.created_at);
    if (!Number.isFinite(created)) return false;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return created >= monthStart;
  }).length;
  const rolesDefinedCount = 1 + (roles.data?.length ?? 0);

  if (!canManageMembers) {
    return (
      <div className={`layerum-page access-page ${inter.className}`}>
        <WorkspaceTopbar section="Access" page="Access" />
        <WorkspaceAccessGate
          requirement={{ type: 'permission', permission: 'members.manage' }}
          title="Access management required"
          description="You need the Manage members permission to view this page."
        >
          <div />
        </WorkspaceAccessGate>
      </div>
    );
  }

  return (
    <div className={`layerum-page access-page ${inter.className}`}>
      <WorkspaceTopbar
        section="Access"
        page="Access"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search members or roles..."
      />

      <section className="access-canvas">
        <header className="access-header">
          <div>
            <h1>Access Management</h1>
            <p>Manage team permissions and define granular resource access.</p>
          </div>
          <button className="invite-cta" onClick={() => setInviteOpen(true)} type="button">
            <UserPlus size={14} />
            Invite Member
          </button>
        </header>

        <section className="access-kpis">
          <article className="active">
            <h3>ACTIVE MEMBERS</h3>
            <p>
              <strong>{allMembers.length}</strong>
              <span>+{membersAddedThisMonth} this month</span>
            </p>
            <Users size={16} />
          </article>
          <article className="warning">
            <h3>PENDING INVITES</h3>
            <p>
              <strong>{pendingInvitesCount}</strong>
              <span>{expiringSoonCount} expiring soon</span>
            </p>
            <Mail size={16} />
          </article>
          <article className="muted">
            <h3>ROLES DEFINED</h3>
            <p>
              <strong>{rolesDefinedCount}</strong>
              <span>{roles.data?.length ?? 0} custom + owner</span>
            </p>
            <Shield size={15} />
          </article>
          <article className={mfaCoverage === 100 ? 'active' : 'warning'}>
            <h3>SECURITY HEALTH</h3>
            <p>
              <strong>{mfaCoverage}%</strong>
              <span>
                {mfaEnabledCount} of {allMembers.length} with 2FA
              </span>
            </p>
            <ShieldCheck size={15} />
          </article>
        </section>

        <section className="access-main-grid">
          <article className="members-card">
            <header>
              <h2>Team Members</h2>
              <div>
                <button type="button" aria-label="Filter members">
                  <SlidersHorizontal size={14} />
                </button>
                <button type="button" aria-label="Export members">
                  <Download size={14} />
                </button>
              </div>
            </header>

            <div className="member-table">
              <div className="head">
                <span>MEMBER</span>
                <span>ROLE</span>
                <span>LAST ACTIVE</span>
                <span>ACTIONS</span>
              </div>
              {filteredMembers.map((row) => {
                return (
                  <div className={`row ${row.kind === 'pending' ? 'pending' : ''}`} key={row.key}>
                    <span className="member">
                      <UserAvatar
                        name={row.fullName}
                        email={row.email}
                        avatarUrl={row.kind === 'active' ? row.member.user.avatar_url : null}
                        alt={row.fullName}
                        size={32}
                      />
                      <b>{row.fullName}</b>
                      <small className={mono.className}>{row.email}</small>
                    </span>
                    <span>
                      <u className={row.roleTone}>{row.roleLabel}</u>
                    </span>
                    <span>{row.lastLabel}</span>
                    <span>
                      {row.kind === 'pending' ? (
                        <span className="invite-actions-wrap">
                          <button
                            className="invite-actions-trigger"
                            type="button"
                            aria-label={`Invite actions for ${row.email}`}
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          <span className="invite-actions-menu" role="menu">
                            <button
                              type="button"
                              onClick={() => resendInvite.mutate(row.invite.id)}
                              disabled={resendInvite.isPending}
                            >
                              <RotateCcw size={12} /> Resend
                            </button>
                            <button
                              className="danger"
                              type="button"
                              onClick={() =>
                                setRevokeInviteTarget({ id: row.invite.id, email: row.email })
                              }
                              disabled={revokeInvite.isPending}
                            >
                              <Trash2 size={12} /> Revoke
                            </button>
                          </span>
                        </span>
                      ) : row.member.role === 'owner' ? null : (
                        <button
                          className="remove"
                          onClick={() =>
                            setRemoveMemberTarget({
                              userId: row.member.user.id,
                              name: row.fullName,
                            })
                          }
                          type="button"
                        >
                          Remove
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
              {members.isLoading ? <SkeletonRows count={4} height={48} /> : null}
              {!members.isLoading && filteredMembers.length === 0 ? (
                <p className="empty">No matching members found.</p>
              ) : null}
            </div>

            {memberRows.length > 15 ? (
              <button className="view-all" type="button">
                VIEW ALL MEMBERS ({memberRows.length})
              </button>
            ) : null}
          </article>

          <aside className="access-side">
            <article className="policy-card">
              <header>
                <ShieldCheck size={15} />
                <h2>Role Permissions</h2>
              </header>

              <div className="permission-row">
                <div>
                  <h3>Owner</h3>
                  <p>System role with full control over the workspace.</p>
                </div>
                <span className="owner">System</span>
              </div>
              {(roles.data ?? []).map((roleItem) => (
                <div className="permission-row" key={roleItem.id}>
                  <div>
                    <h3>{roleItem.name}</h3>
                    <p>
                      {roleItem.description?.trim() || 'No description'}
                      {' · '}
                      {roleItem.permissions.length} permission(s)
                    </p>
                  </div>
                  <div className="role-row-actions">
                    <span className={roleItem.permissions.includes('members.manage') ? 'owner' : 'member'}>
                      {roleItem.assignedCount ?? 0} users
                    </span>
                    {!roleItem.isSystem ? (
                      <>
                        <button
                          className="role-action"
                          type="button"
                          onClick={() => openEditRoleModal(roleItem)}
                        >
                          <Pencil size={12} /> Edit
                        </button>
                        <button
                          className="role-action danger"
                          type="button"
                          onClick={() => setDeleteRoleTarget({ id: roleItem.id, name: roleItem.name })}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              <button type="button" onClick={openCreateRoleModal}>CREATE ROLE</button>
            </article>

            <article className="logs-card">
              <h2>Access Logs</h2>
              <p>Monitor all privilege escalations and login attempts in real-time.</p>
              <Link href={`/w/${workspaceId}/audit`}>Go to Audit Logs →</Link>
            </article>
          </aside>
        </section>
      </section>

      <Modal
        open={inviteOpen}
        title="Invite Member"
        onOpenChange={setInviteOpen}
        disableClose={invite.isPending}
      >
        <form className="layerum-stack" onSubmit={onSubmit}>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Member Email</label>
            <p className="layerum-form-hint">Invite link will be sent to this address.</p>
            <input
              className="layerum-input"
              type="email"
              placeholder="member@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Role</label>
            <p className="layerum-form-hint">Defines access level in this workspace.</p>
            {hasNoRoles ? (
              <div className="invite-no-roles">
                <span>No roles yet</span>
                <button
                  className="layerum-button ghost"
                  type="button"
                  onClick={() => {
                    setInviteOpen(false);
                    openCreateRoleModal();
                  }}
                >
                  <Plus size={14} />
                  Create role
                </button>
              </div>
            ) : (
              <Select
                value={effectiveRoleId}
                onChange={setRoleId}
                options={(roles.data ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                placeholder={roles.isLoading ? 'Loading roles…' : 'Select role'}
                disabled={roles.isLoading}
              />
            )}
          </div>
          <button
            className="layerum-button"
            type="submit"
            disabled={invite.isPending || !effectiveRoleId}
          >
            <Plus size={14} />
            Invite
          </button>
        </form>
      </Modal>

      <Modal
        open={roleModalOpen}
        title={editingRoleId ? 'Edit Role' : 'Create Role'}
        onOpenChange={(open) => {
          setRoleModalOpen(open);
          if (!open) resetRoleForm();
        }}
        disableClose={createRole.isPending || updateRole.isPending}
      >
        <form className="layerum-stack" onSubmit={onSubmitRole}>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Role Name</label>
            <input
              className="layerum-input"
              value={roleName}
              onChange={(event) => setRoleName(event.target.value)}
              placeholder="Data Analyst"
              required
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Description</label>
            <input
              className="layerum-input"
              value={roleDescription}
              onChange={(event) => setRoleDescription(event.target.value)}
              placeholder="Optional role description"
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Permissions</label>
            <div className="role-permissions-grid">
              {PERMISSION_OPTIONS.map((permission) => (
                <label key={permission.value} className="layerum-checkbox role-permission-item">
                  <input
                    type="checkbox"
                    checked={rolePermissions.includes(permission.value)}
                    onChange={() => togglePermission(permission.value)}
                  />
                  <span>{permission.label}</span>
                </label>
              ))}
            </div>
          </div>
          <button
            className="layerum-button"
            type="submit"
            disabled={createRole.isPending || updateRole.isPending}
          >
            {editingRoleId ? 'Save Role' : 'Create Role'}
          </button>
        </form>
      </Modal>

      <ConfirmDestructiveModal
        open={Boolean(removeMemberTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveMemberTarget(null);
        }}
        title="Remove Member"
        description={
          removeMemberTarget ? (
            <>
              Remove <strong>{removeMemberTarget.name}</strong> from this workspace.
            </>
          ) : (
            'This action is irreversible.'
          )
        }
        confirmLabel="Remove member"
        isPending={remove.isPending}
        onConfirm={() => {
          if (!removeMemberTarget) return;
          remove.mutate(removeMemberTarget.userId);
        }}
      />

      <ConfirmDestructiveModal
        open={Boolean(deleteRoleTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteRoleTarget(null);
        }}
        title="Delete Role"
        description={
          deleteRoleTarget ? (
            <>
              Delete role <strong>{deleteRoleTarget.name}</strong>. Users assigned to this role will lose
              this permission set.
            </>
          ) : (
            'This action is irreversible.'
          )
        }
        confirmLabel="Delete role"
        isPending={deleteRole.isPending}
        onConfirm={() => {
          if (!deleteRoleTarget) return;
          deleteRole.mutate(deleteRoleTarget.id);
        }}
      />

      <ConfirmDestructiveModal
        open={Boolean(revokeInviteTarget)}
        onOpenChange={(open) => {
          if (!open) setRevokeInviteTarget(null);
        }}
        title="Revoke Invite"
        description={
          revokeInviteTarget ? (
            <>
              Revoke pending invite for <strong>{revokeInviteTarget.email}</strong>.
            </>
          ) : (
            'This action is irreversible.'
          )
        }
        confirmLabel="Revoke invite"
        isPending={revokeInvite.isPending}
        onConfirm={() => {
          if (!revokeInviteTarget) return;
          revokeInvite.mutate(revokeInviteTarget.id);
        }}
      />
    </div>
  );
}
