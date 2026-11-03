'use client';

import { Toaster } from 'sonner';
import { QueryProvider } from './query-provider';
import { AuthProvider } from './auth-provider';
import { ThemeProvider, useTheme } from './theme-provider';

function AppToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="top-right"
      toastOptions={{
        style: {
          background: 'var(--app-surface)',
          color: 'var(--app-text)',
          border: '1px solid rgba(var(--app-border-rgb), 0.3)',
          borderRadius: '10px',
          boxShadow: '0 12px 32px -8px rgba(0, 0, 0, 0.45)',
          fontSize: '13px',
        },
      }}
    />
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryProvider>
          {children}
          <AppToaster />
        </QueryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
