'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/theme-provider';
import { LoadingScreen } from '@/components/loading-screen';
import { MfaEnforcementModal } from '@/components/mfa-enforcement-modal';
import { shouldNudgeMfa, useMfaStatus } from '@/hooks/use-mfa-status';
import './app-layout.css';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { loading, session } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const mfaStatus = useMfaStatus();
  const [mfaNudgeOpen, setMfaNudgeOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session && pathname !== '/signin') {
      router.replace('/signin');
    }
  }, [loading, session, pathname, router]);

  useEffect(() => {
    if (
      session &&
      mfaStatus.data &&
      shouldNudgeMfa(mfaStatus.data) &&
      pathname !== '/account'
    ) {
      setMfaNudgeOpen(true);
    } else if (!shouldNudgeMfa(mfaStatus.data)) {
      setMfaNudgeOpen(false);
    }
  }, [session, mfaStatus.data, pathname]);

  if (loading || !session) {
    return (
      <div className="app-theme-scope" data-theme={theme}>
        <LoadingScreen tone="app" />
      </div>
    );
  }

  return (
    <div className="app-theme-scope" data-theme={theme}>
      {children}
      <MfaEnforcementModal open={mfaNudgeOpen} onOpenChange={setMfaNudgeOpen} />
    </div>
  );
}
