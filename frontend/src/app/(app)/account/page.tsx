'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Inter } from 'next/font/google';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Download,
  KeyRound,
  LogOut,
  PenLine,
  Save,
  Shield,
  Trash2,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { ConfirmDestructiveModal } from '@/components/confirm-destructive-modal';
import { LoadingScreen } from '@/components/loading-screen';
import { Modal } from '@/components/modal';
import { MfaSetupWizard } from '@/components/mfa-setup-wizard';
import { MfaStepUpModal } from '@/components/mfa-step-up-modal';
import { UserAvatar } from '@/components/user-avatar';
import { WorkspaceTopbar } from '@/components/workspace-topbar';
import { useMfaStatus } from '@/hooks/use-mfa-status';
import type { NotificationPreferences, OAuthCliToken } from '@/lib/types';
import { resolveAvatarUrl, resolveDisplayName } from '@/lib/user-profile';
import { SkeletonRows } from '@/components/loader';
import './account.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const allowedAvatarMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);
const avatarAccept = Array.from(allowedAvatarMimeTypes).join(',');

const NOTIFICATION_SETTINGS: Array<{
  title: string;
  description: string;
  channels: Array<{ key: keyof NotificationPreferences; label: string }>;
}> = [
  {
    title: 'System Health Alerts',
    description: 'Critical infrastructure status updates and downtime notices.',
    channels: [
      { key: 'system_health_in_app', label: 'In-app' },
      { key: 'system_health_email', label: 'Email' },
    ],
  },
  {
    title: 'API Usage Thresholds',
    description: 'Receive alerts when an API key uses 80% of its daily token limit.',
    channels: [
      { key: 'api_usage_in_app', label: 'In-app' },
      { key: 'api_usage_email', label: 'Email' },
    ],
  },
];

export default function AccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { session, user, signOut } = useAuth();
  const token = session?.access_token;
  const returnTo = searchParams.get('from');
  const canReturnTo = Boolean(returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//'));

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(token!),
    enabled: Boolean(token),
  });
  const sessionsQuery = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: () => api.listSessions(token!),
    enabled: Boolean(token),
  });
  const oauthTokensQuery = useQuery({
    queryKey: ['oauth-tokens'],
    queryFn: () => api.listOAuthTokens(token!),
    enabled: Boolean(token),
  });
  const notificationPreferencesQuery = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api.getNotificationPreferences(token!),
    enabled: Boolean(token),
  });
  const notificationPreferencesMutation = useMutation({
    mutationFn: (changes: Partial<NotificationPreferences>) =>
      api.updateNotificationPreferences(token!, changes),
    onSuccess: (preferences) => {
      queryClient.setQueryData(['notification-preferences'], preferences);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const currentEmail = meQuery.data?.email ?? user?.email ?? '';
  const initialName = useMemo(() => {
    return resolveDisplayName(
      {
        full_name: meQuery.data?.full_name ?? null,
        email: currentEmail ?? null,
        user_metadata: user?.user_metadata ?? null,
      },
      '',
    );
  }, [currentEmail, meQuery.data?.full_name, user?.user_metadata]);
  const avatarUrl = useMemo(
    () =>
      resolveAvatarUrl({
        avatar_url: meQuery.data?.avatar_url ?? null,
        email: currentEmail ?? null,
        user_metadata: user?.user_metadata ?? null,
      }),
    [currentEmail, meQuery.data?.avatar_url, user?.user_metadata],
  );
  const passwordUpdatedAt = useMemo(() => {
    const value = meQuery.data?.metadata?.['password_updated_at'];
    return typeof value === 'string' ? value : null;
  }, [meQuery.data?.metadata]);
  const activeSessions = useMemo(
    () => (sessionsQuery.data?.items ?? []).filter((item) => !item.revokedAt),
    [sessionsQuery.data?.items],
  );

  const [fullNameDraft, setFullNameDraft] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState(currentEmail);
  const [newPassword, setNewPassword] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [revokingSessionIds, setRevokingSessionIds] = useState<Record<string, boolean>>({});
  const [revokeTokenTarget, setRevokeTokenTarget] = useState<OAuthCliToken | null>(null);
  const [mfaWizardOpen, setMfaWizardOpen] = useState(false);
  const [mfaDisableOpen, setMfaDisableOpen] = useState(false);
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  const mfaStatus = useMfaStatus();
  const [stepUpFor, setStepUpFor] = useState<'password' | 'delete' | 'email' | null>(null);
  const mfaEnrolled = mfaStatus.data?.enrolled === true;

  const profileMutation = useMutation({
    mutationFn: async () => {
      const fullName = (fullNameDraft ?? initialName).trim();
      const nextEmail = emailDraft.trim();
      return api.updateProfile(token!, {
        full_name: fullName || null,
        email: nextEmail,
      });
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(['me'], updatedUser);
      toast.success('Profile updated');
      setEditProfileOpen(false);
      setFullNameDraft(null);
      setEmailDraft(updatedUser.email);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      const passwordUpdatedAt = new Date().toISOString();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { password_updated_at: passwordUpdatedAt },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Password updated');
      setNewPassword('');
      setChangePasswordOpen(false);
      void meQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const avatarMutation = useMutation({
    mutationFn: async () => {
      if (!avatarFile) throw new Error('Select an image');
      if (!allowedAvatarMimeTypes.has(avatarFile.type)) {
        throw new Error('Avatar must be a PNG, JPEG, WebP, or GIF image');
      }
      if (avatarFile.size > 2 * 1024 * 1024) {
        throw new Error('Avatar must be 2 MB or smaller');
      }
      return api.updateAvatar(token!, avatarFile);
    },
    onSuccess: () => {
      toast.success('Avatar updated');
      setAvatarOpen(false);
      setAvatarFile(null);
      void meQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await signOut();
    },
    onSuccess: () => {
      toast.success('Signed out');
      router.push('/signin');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => api.revokeSession(token!, sessionId),
    onMutate: async (sessionId) => {
      setRevokingSessionIds((current) => ({ ...current, [sessionId]: true }));
    },
    onSuccess: async (result) => {
      toast.success('Session revoked');
      if (result.revokedCurrentSession) {
        await signOut();
        router.push('/signin');
        return;
      }
      sessionsQuery.refetch();
    },
    onSettled: async (_data, _error, sessionId) => {
      setRevokingSessionIds((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeOAuthTokenMutation = useMutation({
    mutationFn: (id: string) => api.revokeOAuthToken(token!, id),
    onSuccess: async () => {
      toast.success('Access revoked');
      setRevokeTokenTarget(null);
      await oauthTokensQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disableMfaMutation = useMutation({
    mutationFn: async () => {
      const factorId = mfaStatus.data?.factors.find(
        (factor) => factor.status === 'verified',
      )?.id;
      if (!factorId) throw new Error('No verified factor found');
      const cleanCode = mfaDisableCode.replace(/\D/g, '');
      if (cleanCode.length !== 6) throw new Error('Enter the 6-digit code');
      // Confirm possession of the authenticator before backend delete.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const target =
        factors?.all.find((factor) => factor.id === factorId) ?? null;
      if (!target) throw new Error('Factor not found');
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: cleanCode,
      });
      if (verifyError) throw verifyError;
      return api.deleteMfaFactor(token!, factorId);
    },
    onSuccess: () => {
      toast.success('Two-factor disabled');
      setMfaDisableOpen(false);
      setMfaDisableCode('');
      void mfaStatus.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.deleteAccount(token!);
      await signOut();
    },
    onSuccess: () => {
      toast.success('Account deleted');
      router.push('/signin');
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 409) {
        const details = error.details as
          | {
              code?: string;
              count?: number;
              workspaces?: Array<{ id: string; name?: string; slug?: string }>;
            }
          | undefined;
        if (details?.code === 'WORKSPACES_EXIST') {
          const names = (details.workspaces ?? [])
            .map((item) => item.name || item.slug || item.id)
            .slice(0, 3);
          const suffix =
            names.length > 0
              ? `: ${names.join(', ')}${(details.count ?? 0) > names.length ? '…' : ''}`
              : '';
          toast.error(`Delete blocked. Remove your workspaces first${suffix}`);
          return;
        }
      }
      if (error instanceof ApiError && error.status === 404) {
        toast.error('Delete account endpoint is not available yet on backend.');
        return;
      }
      toast.error(error.message);
    },
  });

  if (!token || !user) {
    return <LoadingScreen tone="app" />;
  }

  function onSaveProfile(event: FormEvent) {
    event.preventDefault();
    const emailChanged =
      emailDraft.trim().toLowerCase() !== (currentEmail ?? '').toLowerCase();
    if (emailChanged && mfaEnrolled) {
      setStepUpFor('email');
      return;
    }
    profileMutation.mutate();
  }

  function onChangePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (mfaEnrolled) {
      setStepUpFor('password');
      return;
    }
    passwordMutation.mutate();
  }

  function onDeleteAccount() {
    if (mfaEnrolled) {
      setDeleteOpen(false);
      setStepUpFor('delete');
      return;
    }
    deleteMutation.mutate();
  }

  function onStepUpVerified() {
    const action = stepUpFor;
    setStepUpFor(null);
    if (action === 'password') passwordMutation.mutate();
    else if (action === 'delete') deleteMutation.mutate();
    else if (action === 'email') profileMutation.mutate();
  }

  const stepUpCopy: Record<'password' | 'delete' | 'email', { action: string; text: string }> = {
    password: {
      action: 'change your password',
      text: 'Enter the 6-digit code from your authenticator app to change your password.',
    },
    delete: {
      action: 'delete your account',
      text: 'Enter the 6-digit code from your authenticator app to permanently delete your account.',
    },
    email: {
      action: 'change your email address',
      text: 'Enter the 6-digit code from your authenticator app to change your email address.',
    },
  };

  function onUploadAvatar(event: FormEvent) {
    event.preventDefault();
    avatarMutation.mutate();
  }

  function onBackToPrevious() {
    if (canReturnTo && returnTo) {
      router.push(returnTo);
      return;
    }
    router.back();
  }

  function sessionLabel(session: {
    osName?: string | null;
    browserName?: string | null;
    deviceLabel?: string | null;
    ipAddress?: string | null;
  }) {
    const core = [session.osName, session.browserName, session.deviceLabel]
      .filter(Boolean)
      .join(' · ');
    return core || 'Unknown Session';
  }

  function formatSeen(value?: string | null) {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString();
  }

  function formatPasswordChanged(value?: string | null) {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not recorded';
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 60_000) return 'Just now';
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 1) return 'Today';
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  const fullName = (fullNameDraft ?? initialName).trim() || 'Not set';

  return (
    <main className={`account-page ${inter.className}`}>
      <WorkspaceTopbar section="Account" page="Settings" />

      <section className="account-content">
        <section className="account-canvas">
        <header className="account-header">
          <div>
            <h1>Account Settings</h1>
            <p>Manage your personal identity, security credentials, and system preferences.</p>
          </div>
          <button type="button" className="account-back-button" onClick={onBackToPrevious}>
            <ArrowLeft size={12} />
            Back to previous page
          </button>
        </header>

        <section className="account-bento">
          <div className="account-main-col">
            <article className="account-card">
              <header>
                <h2>Profile Information</h2>
                <button
                  type="button"
                  onClick={() => {
                    setFullNameDraft(initialName);
                    setEmailDraft(currentEmail);
                    setEditProfileOpen(true);
                  }}
                >
                  Update profile
                </button>
              </header>
              <div className="account-profile-grid">
                <div className="account-profile-avatar">
                  <UserAvatar
                    name={initialName || null}
                    email={currentEmail || null}
                    avatarUrl={avatarUrl}
                    alt={initialName || currentEmail || 'User avatar'}
                    size={96}
                  />
                  <button type="button" aria-label="Edit avatar" onClick={() => setAvatarOpen(true)}>
                    <PenLine size={10} />
                  </button>
                </div>
                <div className="account-profile-meta">
                  <div>
                    <label>FULL NAME</label>
                    <p>{fullName}</p>
                  </div>
                  <div>
                    <label>EMAIL ADDRESS</label>
                    <p>{currentEmail || '-'}</p>
                  </div>
                </div>
              </div>
            </article>

            <article className="account-card">
              <header>
                <h2>Notification Preferences</h2>
              </header>
              <div className="account-notifs">
                {NOTIFICATION_SETTINGS.map((setting) => (
                  <div className="notif-row" key={setting.title}>
                    <div>
                      <h3>{setting.title}</h3>
                      <p>{setting.description}</p>
                    </div>
                    <div className="notif-channels">
                      {setting.channels.map((channel) => {
                        const enabled = notificationPreferencesQuery.data?.[channel.key] === true;
                        return (
                          <label key={channel.key}>
                            {channel.label}
                            <button
                              type="button"
                              role="switch"
                              aria-checked={enabled}
                              className={`notif-toggle${enabled ? ' on' : ''}`}
                              disabled={
                                !notificationPreferencesQuery.data ||
                                notificationPreferencesMutation.isPending
                              }
                              onClick={() =>
                                notificationPreferencesMutation.mutate({ [channel.key]: !enabled })
                              }
                            >
                              <span />
                            </button>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <aside className="account-side-col">
            <article className="account-card security">
              <h2>Security Context</h2>
              <div className="security-2fa">
                <h3>
                  <Shield size={14} />
                  2FA STATUS
                </h3>
                {mfaStatus.isLoading ? (
                  <p>Checking authenticator status…</p>
                ) : mfaStatus.data?.enrolled ? (
                  <p>Multi-factor authentication is currently enabled via Authenticator App.</p>
                ) : (
                  <p>Multi-factor authentication is off. Add an authenticator app to protect sign-ins.</p>
                )}
                {mfaStatus.data?.enrolled ? (
                  <button type="button" onClick={() => setMfaDisableOpen(true)}>
                    Disable 2FA
                  </button>
                ) : (
                  <button type="button" onClick={() => setMfaWizardOpen(true)}>
                    Configure 2FA
                  </button>
                )}
              </div>
              <div className="security-password">
                <h3>
                  <KeyRound size={14} />
                  PASSWORD
                </h3>
                <p>Last changed: {formatPasswordChanged(passwordUpdatedAt)}</p>
                <button type="button" onClick={() => setChangePasswordOpen(true)}>
                  Change password
                </button>
              </div>
              <div className="security-meta">
                <div>
                  <label>ACTIVE SESSIONS</label>
                  {activeSessions.map((session) => {
                    const isRevoking = Boolean(revokingSessionIds[session.sessionId]);
                    return (
                      <div
                        className={`session-row${session.isCurrent ? ' current' : ''}`}
                        key={session.id}
                      >
                        <div className="session-main">
                          <span>{sessionLabel(session)}</span>
                          <small>
                            Last seen: {formatSeen(session.lastSeenAt)}
                            {session.ipAddress ? ` · IP: ${session.ipAddress}` : ''}
                          </small>
                        </div>
                        {session.isCurrent ? (
                          <b>CURRENT</b>
                        ) : (
                          <button
                            type="button"
                            onClick={() => revokeSessionMutation.mutate(session.sessionId)}
                            disabled={isRevoking}
                            aria-busy={isRevoking}
                          >
                            {isRevoking ? (
                              <>
                                <span className="session-revoke-spinner" aria-hidden="true" />
                                Revoking...
                              </>
                            ) : (
                              'REVOKE'
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {sessionsQuery.isLoading ? <SkeletonRows count={2} height={56} /> : null}
                  {!sessionsQuery.isLoading &&
                  activeSessions.length === 0 ? (
                    <div className="session-row">
                      <span>No active sessions found.</span>
                    </div>
                  ) : null}
                </div>
                <div>
                  <label>CONNECTED APPS</label>
                  {(oauthTokensQuery.data?.items ?? []).map((item) => (
                    <div className="session-row" key={item.id}>
                      <div className="session-main">
                        <span>{item.name}</span>
                        <small>
                          {item.last_used_at
                            ? `Last used: ${formatSeen(item.last_used_at)}`
                            : 'Never used'}
                          {` · Expires: ${formatSeen(item.expires_at)}`}
                        </small>
                      </div>
                      <button type="button" onClick={() => setRevokeTokenTarget(item)}>
                        REVOKE
                      </button>
                    </div>
                  ))}
                  {oauthTokensQuery.isLoading ? <SkeletonRows count={1} height={56} /> : null}
                  {!oauthTokensQuery.isLoading &&
                  (oauthTokensQuery.data?.items ?? []).length === 0 ? (
                    <div className="session-row">
                      <span>None</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>

            <article className="account-maintenance">
              <h2>Account Actions</h2>
              <button type="button" onClick={() => toast.info('Data export queued')}>
                <span>Export Account Data</span>
                <Download size={12} />
              </button>
              <button type="button" className="danger" onClick={() => setDeleteOpen(true)}>
                <span>Terminate Account</span>
                <Trash2 size={12} />
              </button>
              <button type="button" className="ghost" onClick={() => logoutMutation.mutate()}>
                <span>{logoutMutation.isPending ? 'Signing out...' : 'Sign out'}</span>
                <LogOut size={12} />
              </button>
            </article>
          </aside>
        </section>

        </section>
      </section>

      <Modal
        open={editProfileOpen}
        title="Update Profile"
        onOpenChange={(open) => {
          setEditProfileOpen(open);
          if (open) {
            setFullNameDraft(initialName);
            setEmailDraft(currentEmail);
          }
        }}
      >
        <form className="layerum-stack" onSubmit={onSaveProfile}>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Full Name</label>
            <input
              className="layerum-input"
              placeholder="Full name"
              value={fullNameDraft ?? initialName}
              onChange={(event) => setFullNameDraft(event.target.value)}
            />
          </div>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Email Address</label>
            <input
              className="layerum-input"
              type="email"
              placeholder="name@company.com"
              value={emailDraft}
              onChange={(event) => setEmailDraft(event.target.value)}
              required
            />
          </div>
          <button className="layerum-button" disabled={profileMutation.isPending} type="submit">
            <Save className="layerum-inline-icon" />
            {profileMutation.isPending ? 'Saving...' : 'Save profile'}
          </button>
        </form>
      </Modal>

      <Modal
        open={avatarOpen}
        title="Change Avatar"
        onOpenChange={(open) => {
          setAvatarOpen(open);
          if (!open) setAvatarFile(null);
        }}
      >
        <form className="layerum-stack" onSubmit={onUploadAvatar}>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Avatar Image</label>
            <p className="layerum-form-hint">PNG, JPG, WEBP, or GIF. Max 2 MB.</p>
            <input
              className="layerum-input"
              type="file"
              accept={avatarAccept}
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                if (nextFile && !allowedAvatarMimeTypes.has(nextFile.type)) {
                  toast.error('Avatar must be a PNG, JPEG, WebP, or GIF image');
                  event.currentTarget.value = '';
                  setAvatarFile(null);
                  return;
                }
                if (nextFile && nextFile.size > 2 * 1024 * 1024) {
                  toast.error('Avatar must be 2 MB or smaller');
                  event.currentTarget.value = '';
                  setAvatarFile(null);
                  return;
                }
                setAvatarFile(nextFile);
              }}
            />
            {avatarFile ? <p className="layerum-form-hint">Selected: {avatarFile.name}</p> : null}
          </div>
          <button className="layerum-button" disabled={avatarMutation.isPending || !avatarFile} type="submit">
            <Save className="layerum-inline-icon" />
            {avatarMutation.isPending ? 'Uploading...' : 'Upload avatar'}
          </button>
        </form>
      </Modal>

      <Modal open={changePasswordOpen} title="Change Password" onOpenChange={setChangePasswordOpen}>
        <form className="layerum-stack" onSubmit={onChangePassword}>
          <div className="layerum-form-field">
            <label className="layerum-form-label">New Password</label>
            <input
              className="layerum-input"
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
              required
            />
          </div>
          <button className="layerum-button" disabled={passwordMutation.isPending} type="submit">
            <Save className="layerum-inline-icon" />
            {passwordMutation.isPending ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </Modal>

      <ConfirmDestructiveModal
        open={deleteOpen}
        title="Delete Account"
        onOpenChange={setDeleteOpen}
        description={
          <>
            Type <strong>DELETE</strong> to confirm. This action is irreversible.
          </>
        }
        confirmLabel="Delete permanently"
        isPending={deleteMutation.isPending}
        onConfirm={onDeleteAccount}
        requirePhrase
      />

      <ConfirmDestructiveModal
        open={revokeTokenTarget !== null}
        title="Revoke access"
        onOpenChange={(open) => {
          if (!open) setRevokeTokenTarget(null);
        }}
        description={revokeTokenTarget?.name ?? ''}
        confirmLabel="Revoke"
        isPending={revokeOAuthTokenMutation.isPending}
        onConfirm={() => {
          if (revokeTokenTarget) revokeOAuthTokenMutation.mutate(revokeTokenTarget.id);
        }}
      />

      <MfaSetupWizard
        open={mfaWizardOpen}
        onOpenChange={setMfaWizardOpen}
        onComplete={() => void mfaStatus.refetch()}
      />

      <Modal
        open={mfaDisableOpen}
        title="Disable two-factor"
        onOpenChange={(next) => {
          setMfaDisableOpen(next);
          if (!next) setMfaDisableCode('');
        }}
      >
        <form
          className="layerum-stack"
          onSubmit={(event) => {
            event.preventDefault();
            disableMfaMutation.mutate();
          }}
        >
          <p className="layerum-form-hint">
            Enter the current 6-digit code from your authenticator app to
            confirm removal.
          </p>
          <div className="layerum-form-field">
            <label className="layerum-form-label">Authenticator code</label>
            <input
              className="layerum-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              value={mfaDisableCode}
              onChange={(event) =>
                setMfaDisableCode(event.target.value.replace(/\D/g, '').slice(0, 6))
              }
              required
            />
          </div>
          <button
            className="layerum-button danger"
            disabled={disableMfaMutation.isPending || mfaDisableCode.length !== 6}
            type="submit"
          >
            {disableMfaMutation.isPending ? 'Disabling...' : 'Disable 2FA'}
          </button>
        </form>
      </Modal>

      {stepUpFor ? (
        <MfaStepUpModal
          open={stepUpFor !== null}
          onOpenChange={(next) => {
            if (!next) setStepUpFor(null);
          }}
          actionLabel={stepUpCopy[stepUpFor].action}
          description={stepUpCopy[stepUpFor].text}
          onVerified={onStepUpVerified}
        />
      ) : null}
    </main>
  );
}
