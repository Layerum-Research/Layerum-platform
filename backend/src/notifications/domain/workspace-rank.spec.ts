import { workspaceRankOf } from './workspace-rank';

describe('workspaceRankOf', () => {
  const base = {
    legacyRole: 'viewer',
    roleName: null,
    roleIsSystem: false,
    hasCustomRole: false,
  };

  it('ranks owners highest', () => {
    expect(workspaceRankOf({ ...base, legacyRole: 'owner' })).toBe(3);
  });

  it('ranks the system Admin role as admin', () => {
    expect(
      workspaceRankOf({
        ...base,
        roleName: 'Admin',
        roleIsSystem: true,
        hasCustomRole: true,
      }),
    ).toBe(2);
  });

  it('ranks legacy admins without an assigned role as admin', () => {
    expect(workspaceRankOf({ ...base, legacyRole: 'admin' })).toBe(2);
  });

  it('does not promote custom roles named Admin', () => {
    expect(
      workspaceRankOf({ ...base, roleName: 'Admin', hasCustomRole: true }),
    ).toBe(1);
  });
});
