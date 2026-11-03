import { AuditController } from './audit.controller';
import { WORKSPACE_PERMISSION_KEY } from '../common/decorators/require-workspace-permission.decorator';

describe('AuditController permissions', () => {
  it('requires audit.read to fetch logs', () => {
    const permission = Reflect.getMetadata(
      WORKSPACE_PERMISSION_KEY,
      AuditController.prototype.getLogs,
    );

    expect(permission).toBe('audit.read');
  });
});
