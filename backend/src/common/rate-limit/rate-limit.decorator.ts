import { SetMetadata } from '@nestjs/common';
import type { RateLimitPolicyName } from './rate-limit.types';

export const RATE_LIMIT_POLICY_KEY = 'rate-limit:policy';
export const SKIP_RATE_LIMIT_KEY = 'rate-limit:skip';

export const RateLimitPolicy = (policy: RateLimitPolicyName) =>
  SetMetadata(RATE_LIMIT_POLICY_KEY, policy);

export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
