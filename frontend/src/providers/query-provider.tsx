'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            // Short enough to stay fresh, long enough that back-navigation
            // renders stale data instantly with a background refresh.
            // Weak-PC note: longer stale = fewer requests = less CPU/radio.
            staleTime: 30_000,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
