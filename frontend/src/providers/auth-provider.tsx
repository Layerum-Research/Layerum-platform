'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { safeNextPath } from '@/lib/safe-next-path';
import { ApiError, api } from '@/lib/api-client';

type OAuthProvider = 'github' | 'google';

type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
};

type SignUpResult = {
  error: AuthError | null;
  sessionCreated: boolean;
  needsEmailConfirmation: boolean;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<AuthError | null>;
  signInWithOAuth: (
    provider: OAuthProvider,
    nextPath?: string,
  ) => Promise<AuthError | null>;
  signUpWithPassword: (input: SignUpInput) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthError(error: unknown): AuthError {
  const message =
    error instanceof Error ? error.message : 'Authentication request failed';
  return {
    name: 'AuthError',
    message,
    status: error instanceof ApiError ? error.status : undefined,
  } as AuthError;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signInWithPassword: async (email, password) => {
        try {
          const result = await api.signInWithPassword({ email, password });
          if (!result.session?.access_token || !result.session.refresh_token) {
            return toAuthError(new Error('Session not created'));
          }
          const { error } = await supabase.auth.setSession({
            access_token: result.session.access_token,
            refresh_token: result.session.refresh_token,
          });
          return error;
        } catch (error) {
          return toAuthError(error);
        }
      },
      signInWithOAuth: async (provider, nextPath = '/workspaces') => {
        const safePath = safeNextPath(nextPath);
        const redirectTo =
          typeof window !== 'undefined'
            ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(safePath)}`
            : undefined;
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo },
        });
        return error;
      },
      signUpWithPassword: async ({ email, password, fullName }) => {
        try {
          const result = await api.signUpWithPassword({
            email,
            password,
            fullName,
          });
          const sessionCreated = Boolean(result.session);

          if (result.session?.access_token && result.session.refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token: result.session.access_token,
              refresh_token: result.session.refresh_token,
            });
            if (error) {
              return {
                error,
                sessionCreated: false,
                needsEmailConfirmation: false,
              };
            }
          }

          return {
            error: null,
            sessionCreated,
            needsEmailConfirmation:
              result.needsEmailConfirmation ?? !sessionCreated,
          };
        } catch (error) {
          return {
            error: toAuthError(error),
            sessionCreated: false,
            needsEmailConfirmation: false,
          };
        }
      },
      signOut: async () => {
        const accessToken = session?.access_token;
        if (accessToken) {
          try {
            await api.logout(accessToken);
          } catch (error) {
            if (!(error instanceof ApiError && error.status === 401)) {
              console.error('[auth] backend logout failed', error);
            }
          }
        }
        await supabase.auth.signOut({ scope: 'local' });
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
