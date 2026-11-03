import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const enabled = (process.env.INTERNAL_API_ENABLED ?? 'false')
      .trim()
      .toLowerCase();
    if (enabled !== 'true' && enabled !== '1') {
      throw new ForbiddenException('Internal API is disabled');
    }

    const expected = (process.env.INTERNAL_GATEWAY_TOKEN ?? '').trim();
    if (!expected) {
      throw new ForbiddenException('Internal API token is not configured');
    }

    const req = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const raw = req.headers?.['x-internal-token'];
    const provided = Array.isArray(raw) ? raw[0] : raw;
    if (!provided || !this.constantTimeEquals(provided, expected)) {
      throw new UnauthorizedException('Invalid internal token');
    }
    return true;
  }

  private constantTimeEquals(input: string, expected: string) {
    const a = Buffer.from(input, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
