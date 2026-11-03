import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { EmailService } from '../email/email.service';
import { SessionAccessCache } from '../common/auth/session-access.cache';

const mockEmail = { sendTextEmail: jest.fn() } as unknown as EmailService;

function queryChain() {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn(),
    maybeSingle: jest.fn(),
  };
  return query;
}

describe('AuthService', () => {
  it('revokes the current session on logout', async () => {
    const now = new Date('2026-04-12T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const secondEq = jest.fn().mockResolvedValue({ error: null });
    const firstEq = jest.fn().mockReturnValue({ eq: secondEq });
    const update = jest.fn().mockReturnValue({ eq: firstEq });
    const from = jest.fn().mockReturnValue({ update });
    const service = new AuthService({
      admin: { from },
    } as unknown as SupabaseService, mockEmail, new SessionAccessCache());

    try {
      await expect(
        service.logoutCurrentSession('user-1', 'session-1'),
      ).resolves.toEqual({ success: true, revokedSessionId: 'session-1' });
    } finally {
      jest.useRealTimers();
    }

    expect(from).toHaveBeenCalledWith('user_sessions');
    expect(update).toHaveBeenCalledWith({ revoked_at: now.toISOString() });
    expect(firstEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(secondEq).toHaveBeenCalledWith('session_id', 'session-1');
  });

  it('deletes the user avatar and sessions after deleting account', async () => {
    const workspacesQuery = queryChain();
    workspacesQuery.order.mockResolvedValue({ data: [], error: null });

    const usersQuery = queryChain();
    usersQuery.maybeSingle.mockResolvedValue({
      data: { avatar_url: 'avatars/user-1/avatar.png' },
      error: null,
    });

    const sessionsEq = jest.fn().mockResolvedValue({ error: null });
    const sessionsDelete = jest.fn().mockReturnValue({ eq: sessionsEq });

    const from = jest.fn((table: string) => {
      if (table === 'workspaces') return workspacesQuery;
      if (table === 'users') return usersQuery;
      if (table === 'user_sessions') return { delete: sessionsDelete };
      throw new Error(`Unexpected table: ${table}`);
    });
    const removeObjects = jest.fn().mockResolvedValue(undefined);
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    const service = new AuthService({
      admin: {
        from,
        auth: { admin: { deleteUser } },
      },
      removeObjects,
    } as unknown as SupabaseService, mockEmail, new SessionAccessCache());

    await expect(service.deleteAccount('user-1')).resolves.toEqual({
      success: true,
    });

    expect(removeObjects).toHaveBeenCalledWith('sources', [
      'avatars/user-1/avatar.png',
    ]);
    expect(sessionsDelete).toHaveBeenCalled();
    expect(sessionsEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(deleteUser).toHaveBeenCalledWith('user-1');
    expect(deleteUser.mock.invocationCallOrder[0]).toBeLessThan(
      removeObjects.mock.invocationCallOrder[0],
    );
    expect(deleteUser.mock.invocationCallOrder[0]).toBeLessThan(
      sessionsDelete.mock.invocationCallOrder[0],
    );
  });

  it('does not delete avatar or sessions when auth user deletion fails', async () => {
    const workspacesQuery = queryChain();
    workspacesQuery.order.mockResolvedValue({ data: [], error: null });

    const usersQuery = queryChain();
    usersQuery.maybeSingle.mockResolvedValue({
      data: { avatar_url: 'avatars/user-1/avatar.png' },
      error: null,
    });

    const sessionsDelete = jest.fn();
    const from = jest.fn((table: string) => {
      if (table === 'workspaces') return workspacesQuery;
      if (table === 'users') return usersQuery;
      if (table === 'user_sessions') return { delete: sessionsDelete };
      throw new Error(`Unexpected table: ${table}`);
    });
    const removeObjects = jest.fn();
    const deleteUser = jest
      .fn()
      .mockResolvedValue({ error: { message: 'auth failed' } });
    const service = new AuthService({
      admin: {
        from,
        auth: { admin: { deleteUser } },
      },
      removeObjects,
    } as unknown as SupabaseService, mockEmail, new SessionAccessCache());

    await expect(service.deleteAccount('user-1')).rejects.toThrow(
      'auth failed',
    );

    expect(removeObjects).not.toHaveBeenCalled();
    expect(sessionsDelete).not.toHaveBeenCalled();
  });

  it('keeps account deletion successful when follow-up cleanup fails', async () => {
    const workspacesQuery = queryChain();
    workspacesQuery.order.mockResolvedValue({ data: [], error: null });

    const usersQuery = queryChain();
    usersQuery.maybeSingle.mockResolvedValue({
      data: { avatar_url: 'avatars/user-1/avatar.png' },
      error: null,
    });

    const sessionsEq = jest.fn().mockResolvedValue({
      error: { message: 'session cleanup failed' },
    });
    const sessionsDelete = jest.fn().mockReturnValue({ eq: sessionsEq });
    const from = jest.fn((table: string) => {
      if (table === 'workspaces') return workspacesQuery;
      if (table === 'users') return usersQuery;
      if (table === 'user_sessions') return { delete: sessionsDelete };
      throw new Error(`Unexpected table: ${table}`);
    });
    const removeObjects = jest
      .fn()
      .mockRejectedValue(new Error('storage cleanup failed'));
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    const service = new AuthService({
      admin: {
        from,
        auth: { admin: { deleteUser } },
      },
      removeObjects,
    } as unknown as SupabaseService, mockEmail, new SessionAccessCache());

    await expect(service.deleteAccount('user-1')).resolves.toEqual({
      success: true,
    });

    expect(deleteUser).toHaveBeenCalledWith('user-1');
    expect(removeObjects).toHaveBeenCalled();
    expect(sessionsDelete).toHaveBeenCalled();
  });

  it('keeps account deletion blocked while owned workspaces exist', async () => {
    const workspacesQuery = queryChain();
    workspacesQuery.order.mockResolvedValue({
      data: [{ id: 'workspace-1', name: 'Acme', slug: 'acme' }],
      error: null,
    });
    const from = jest.fn().mockReturnValue(workspacesQuery);
    const deleteUser = jest.fn();
    const removeObjects = jest.fn();
    const service = new AuthService({
      admin: {
        from,
        auth: { admin: { deleteUser } },
      },
      removeObjects,
    } as unknown as SupabaseService, mockEmail, new SessionAccessCache());

    await expect(service.deleteAccount('user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(removeObjects).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
