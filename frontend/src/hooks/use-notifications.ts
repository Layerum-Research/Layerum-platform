'use client';

import { useEffect, useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { NOTIFICATION_TYPES, type AppNotification } from '@/lib/types';

const notificationSchema = z.object({
  id: z.string(),
  workspace_id: z.string().nullable(),
  type: z.enum(NOTIFICATION_TYPES),
  severity: z.enum(['info', 'warning', 'critical']),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  created_at: z.string(),
});

function belongsToScope(
  notification: AppNotification,
  workspaceId: string | undefined,
) {
  return notification.workspace_id === null || notification.workspace_id === workspaceId;
}

export function useNotifications(workspaceId?: string) {
  const { session } = useAuth();
  const token = session?.access_token;
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ['notifications', workspaceId ?? null] as const,
    [workspaceId],
  );

  const query = useQuery({
    queryKey,
    queryFn: () => api.listNotifications(token!, workspaceId),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!userId) return;
    let subscribedBefore = false;

    const channel = supabase
      .channel(`notifications:${userId}:${workspaceId ?? 'global'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (change) => {
          const parsed = notificationSchema.safeParse(change.new);
          if (!parsed.success || !belongsToScope(parsed.data, workspaceId)) return;
          const incoming = parsed.data;
          queryClient.setQueryData<AppNotification[]>(queryKey, (current = []) =>
            current.some((item) => item.id === incoming.id)
              ? current
              : [incoming, ...current],
          );
        },
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (subscribedBefore) void queryClient.invalidateQueries({ queryKey });
        subscribedBefore = true;
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, workspaceId, queryClient, queryKey]);

  const markRead = useMutation({
    mutationFn: (notificationId: string) =>
      api.markNotificationRead(token!, notificationId),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AppNotification[]>(queryKey);
      queryClient.setQueryData<AppNotification[]>(queryKey, (current = []) =>
        current.filter((item) => item.id !== notificationId),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.markAllNotificationsRead(token!, workspaceId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AppNotification[]>(queryKey);
      queryClient.setQueryData<AppNotification[]>(queryKey, []);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
    },
  });

  const items = query.data ?? [];

  return {
    items,
    unreadCount: items.length,
    isLoading: query.isLoading,
    markRead: (notificationId: string) => markRead.mutate(notificationId),
    markAllRead: () => markAllRead.mutate(),
  };
}

export type NotificationsState = ReturnType<typeof useNotifications>;
