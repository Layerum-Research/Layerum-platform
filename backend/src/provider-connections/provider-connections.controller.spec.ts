import { ProviderConnectionsController } from './provider-connections.controller';
import { WORKSPACE_PERMISSION_KEY } from '../common/decorators/require-workspace-permission.decorator';

describe('ProviderConnectionsController permissions', () => {
  const guardedMethods: Array<keyof ProviderConnectionsController> = [
    'create',
    'findAll',
    'findOne',
    'test',
    'update',
    'remove',
  ];

  it.each(guardedMethods)('requires providers.manage for %s', (methodName) => {
    const permission = Reflect.getMetadata(
      WORKSPACE_PERMISSION_KEY,
      ProviderConnectionsController.prototype[methodName],
    );

    expect(permission).toBe('providers.manage');
  });
});
