'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

export type MfaFactor = {
  id: string;
  friendlyName: string | null;
  factorType: string;
  status: string;
  createdAt: string;
  lastChallengedAt: string | null;
};

export type MfaStatus = {
  enrolled: boolean;
  factors: MfaFactor[];
  dismissedAt: string | null;
};

const STALE_MS = 30_000;

export function useMfaStatus() {
  const { session } = useAuth();
  const token = session?.access_token;

  return useQuery<MfaStatus>({
    queryKey: ['mfa-status'],
    queryFn: () => api.getMfaStatus(token!),
    enabled: Boolean(token),
    staleTime: STALE_MS,
    retry: 1,
  });
}

const DISMISS_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldNudgeMfa(status: MfaStatus | undefined): boolean {
  if (!status || status.enrolled) return false;
  if (!status.dismissedAt) return true;
  const dismissedAt = new Date(status.dismissedAt).getTime();
  if (Number.isNaN(dismissedAt)) return true;
  return Date.now() - dismissedAt > DISMISS_GRACE_MS;
}
