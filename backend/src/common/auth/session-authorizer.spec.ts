import { UnauthorizedException } from '@nestjs/common';
import { SessionAccessCache } from './session-access.cache';
import {
  SessionAccessRepository,
  type SessionAccess,
} from './session-access.repository';
import { SessionAuthorizer } from './session-authorizer';

const TOKEN = { userId: 'user-1', sessionId: 'session-1' };
const CLIENT = { ipAddress: '127.0.0.1', userAgent: 'Mozilla/5.0 Chrome/1' };

function createAuthorizer(access: SessionAccess) {
  const authorize = jest.fn().mockResolvedValue(access);
  const repository = { authorize } as unknown as SessionAccessRepository;
  return {
    authorizer: new SessionAuthorizer(repository, new SessionAccessCache()),
    authorize,
  };
}

describe('SessionAuthorizer', () => {
  it('queries the repository only once while cached', async () => {
    const { authorizer, authorize } = createAuthorizer({
      userExists: true,
      revoked: false,
    });

    await authorizer.authorize(TOKEN, CLIENT);
    await authorizer.authorize(TOKEN, CLIENT);

    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it('rejects revoked sessions', async () => {
    const { authorizer } = createAuthorizer({
      userExists: true,
      revoked: true,
    });

    await expect(authorizer.authorize(TOKEN, CLIENT)).rejects.toThrow(
      new UnauthorizedException('Session has been revoked'),
    );
  });

  it('rejects deleted users', async () => {
    const { authorizer } = createAuthorizer({
      userExists: false,
      revoked: false,
    });

    await expect(authorizer.authorize(TOKEN, CLIENT)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
