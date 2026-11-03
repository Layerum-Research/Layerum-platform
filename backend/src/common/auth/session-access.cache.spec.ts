import { SessionAccessCache } from './session-access.cache';

const ACCESS = { userExists: true, revoked: false };

describe('SessionAccessCache', () => {
  afterEach(() => jest.useRealTimers());

  it('returns cached access until the ttl expires', () => {
    jest.useFakeTimers().setSystemTime(0);
    const cache = new SessionAccessCache();
    cache.set('user-1', 'session-1', ACCESS);

    expect(cache.get('user-1', 'session-1')).toEqual(ACCESS);
    jest.setSystemTime(60_001);
    expect(cache.get('user-1', 'session-1')).toBeNull();
  });

  it('invalidates a single session', () => {
    const cache = new SessionAccessCache();
    cache.set('user-1', 'session-1', ACCESS);
    cache.set('user-1', 'session-2', ACCESS);

    cache.invalidate('user-1', 'session-1');

    expect(cache.get('user-1', 'session-1')).toBeNull();
    expect(cache.get('user-1', 'session-2')).toEqual(ACCESS);
  });

  it('invalidates every session of a user', () => {
    const cache = new SessionAccessCache();
    cache.set('user-1', 'session-1', ACCESS);
    cache.set('user-1', null, ACCESS);
    cache.set('user-2', 'session-1', ACCESS);

    cache.invalidateUser('user-1');

    expect(cache.get('user-1', 'session-1')).toBeNull();
    expect(cache.get('user-1', null)).toBeNull();
    expect(cache.get('user-2', 'session-1')).toEqual(ACCESS);
  });
});
