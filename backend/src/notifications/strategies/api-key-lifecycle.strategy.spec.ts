import { NotificationDirectory } from '../domain/ports';
import { ApiKeyLifecycleStrategy } from './api-key-lifecycle.strategy';

function createDirectory() {
  return {
    listRankedMembers: jest.fn().mockResolvedValue([
      { userId: 'owner', rank: 3 },
      { userId: 'admin', rank: 2 },
      { userId: 'second-admin', rank: 2 },
      { userId: 'viewer', rank: 1 },
    ]),
    getWorkspaceName: jest.fn().mockResolvedValue('Acme'),
    getUserDisplayName: jest.fn().mockResolvedValue('Alex'),
  } as unknown as NotificationDirectory;
}

const EVENT = {
  type: 'api_key_created' as const,
  workspaceId: 'workspace-1',
  keyId: 'key-1',
  keyName: 'Production',
};

describe('ApiKeyLifecycleStrategy', () => {
  it('notifies only members ranked strictly above the actor', async () => {
    const strategy = new ApiKeyLifecycleStrategy(createDirectory());

    const drafts = await strategy.buildDrafts({
      ...EVENT,
      actorUserId: 'admin',
    });

    expect(drafts.map((draft) => draft.userId)).toEqual(['owner']);
  });

  it('notifies nobody when an owner acts', async () => {
    const strategy = new ApiKeyLifecycleStrategy(createDirectory());

    await expect(
      strategy.buildDrafts({ ...EVENT, actorUserId: 'owner' }),
    ).resolves.toEqual([]);
  });
});
