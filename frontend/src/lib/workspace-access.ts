import type { WorkspaceMember, WorkspaceRolePermission } from './types';

export type WorkspaceAccessRequirement =
  | { type: 'role'; roles: Array<'owner' | 'admin'> }
  | { type: 'permission'; permission: WorkspaceRolePermission };

const ALL_PERMISSIONS: WorkspaceRolePermission[] = [
  'members.manage',
  'providers.manage',
  'models.manage',
  'data.manage',
  'query.run',
  'api_keys.manage',
  'audit.read',
];

const LEGACY_ROLE_PERMISSIONS: Record<
  WorkspaceMember['role'],
  WorkspaceRolePermission[]
> = {
  owner: [...ALL_PERMISSIONS],
  admin: [...ALL_PERMISSIONS],
  editor: ['models.manage', 'data.manage', 'query.run'],
  viewer: ['query.run'],
  api_only: ['query.run'],
};

export function resolveWorkspacePermissions(member: WorkspaceMember | null) {
  if (!member) return [] as WorkspaceRolePermission[];
  if (member.isOwner || member.role === 'owner' || member.role === 'admin') {
    return [...ALL_PERMISSIONS];
  }

  const rolePermissions = member.roleDefinition?.permissions ?? [];
  if (rolePermissions.length > 0) {
    return [...rolePermissions];
  }

  return [...LEGACY_ROLE_PERMISSIONS[member.role]];
}

export function canAccessWorkspaceRequirement(
  member: WorkspaceMember | null,
  requirement: WorkspaceAccessRequirement,
) {
  if (!member) return false;

  if (requirement.type === 'role') {
    return requirement.roles.includes(member.role as 'owner' | 'admin');
  }

  const permissions = resolveWorkspacePermissions(member);
  return permissions.includes(requirement.permission);
}

