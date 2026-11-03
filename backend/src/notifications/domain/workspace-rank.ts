export type WorkspaceRank = 1 | 2 | 3;

export type WorkspaceMembership = {
  legacyRole: string;
  roleName: string | null;
  roleIsSystem: boolean;
  hasCustomRole: boolean;
};

const OWNER_RANK: WorkspaceRank = 3;
export const ADMIN_RANK: WorkspaceRank = 2;
const MEMBER_RANK: WorkspaceRank = 1;
const SYSTEM_ADMIN_ROLE = 'Admin';

export function workspaceRankOf(
  membership: WorkspaceMembership,
): WorkspaceRank {
  if (membership.legacyRole === 'owner') return OWNER_RANK;
  if (membership.roleIsSystem && membership.roleName === SYSTEM_ADMIN_ROLE) {
    return ADMIN_RANK;
  }
  if (membership.legacyRole === 'admin' && !membership.hasCustomRole) {
    return ADMIN_RANK;
  }
  return MEMBER_RANK;
}
