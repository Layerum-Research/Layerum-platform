import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AllowCliToken } from '../decorators/allow-cli-token.decorator';
import type { AccessTokenVerifier } from '../auth/access-token-verifier';
import type { CliTokenAuthenticator } from '../auth/cli-token-authenticator';
import type { SessionAuthorizer } from '../auth/session-authorizer';
import { JwtAuthGuard } from './jwt-auth.guard';

class OpenController {
  @AllowCliToken()
  allowed() {}

  denied() {}
}

@AllowCliToken()
class OpenClassController {
  anything() {}
}

function setup() {
  const verify = jest
    .fn()
    .mockResolvedValue({ userId: 'user-jwt', sessionId: 'session-1' });
  const authorize = jest.fn().mockResolvedValue(undefined);
  const authenticate = jest.fn().mockResolvedValue('user-cli');
  const guard = new JwtAuthGuard(
    { verify } as unknown as AccessTokenVerifier,
    { authorize } as unknown as SessionAuthorizer,
    { authenticate } as unknown as CliTokenAuthenticator,
    new Reflector(),
  );

  function contextFor(
    handler: () => void,
    controller: new () => object,
    bearer: string,
  ) {
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${bearer}`, 'user-agent': 'jest' },
      ip: '127.0.0.1',
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => controller,
    } as unknown as ExecutionContext;
    return { context, request };
  }

  return { guard, verify, authorize, authenticate, contextFor };
}

describe('JwtAuthGuard', () => {
  it('rejects a cli token on a route without the decorator', async () => {
    const { guard, authenticate, contextFor } = setup();
    const { context } = contextFor(
      OpenController.prototype.denied,
      OpenController,
      'lyr_at_token',
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('accepts a cli token on a decorated handler', async () => {
    const { guard, authenticate, contextFor } = setup();
    const { context, request } = contextFor(
      OpenController.prototype.allowed,
      OpenController,
      'lyr_at_token',
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledWith('lyr_at_token');
    expect(request.user).toEqual({ id: 'user-cli', session_id: null });
  });

  it('accepts a cli token on a decorated controller', async () => {
    const { guard, contextFor } = setup();
    const { context } = contextFor(
      OpenClassController.prototype.anything,
      OpenClassController,
      'lyr_at_token',
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects an invalid cli token', async () => {
    const { guard, authenticate, contextFor } = setup();
    authenticate.mockRejectedValue(new UnauthorizedException());
    const { context } = contextFor(
      OpenController.prototype.allowed,
      OpenController,
      'lyr_at_token',
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('keeps the supabase jwt path unchanged', async () => {
    const { guard, verify, authorize, authenticate, contextFor } = setup();
    const { context, request } = contextFor(
      OpenController.prototype.denied,
      OpenController,
      'eyJ.jwt.token',
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('eyJ.jwt.token');
    expect(authorize).toHaveBeenCalled();
    expect(authenticate).not.toHaveBeenCalled();
    expect(request.user).toEqual({ id: 'user-jwt', session_id: 'session-1' });
  });
});
