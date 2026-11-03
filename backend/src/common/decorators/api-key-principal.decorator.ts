import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ApiKeyPrincipal } from '../interfaces/api-key-principal.interface';

export const ApiKeyPrincipalParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiKeyPrincipal => {
    const request = ctx.switchToHttp().getRequest<{ apiKeyPrincipal: ApiKeyPrincipal }>();
    return request.apiKeyPrincipal;
  },
);
