'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BookOpenText, LayoutGrid, LogOut, Menu, MessageSquareText, Moon, Search, Sun, Terminal, UserRound, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/theme-provider';
import { WORKSPACE_NAV } from './workspace-nav';
import { UserAvatar } from './user-avatar';
import { resolveAvatarUrl, resolveDisplayName } from '@/lib/user-profile';
import { FeedbackModal } from './feedback-modal';
import { ConnectModal } from './connect-modal';
import { useWorkspaceAccessOptional } from './workspace-access';
import { NotificationSidebar } from './notification-sidebar';
import { useNotifications } from '@/hooks/use-notifications';
import './workspace-topbar.css';

type WorkspaceTopbarProps = {
  section: string;
  page: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
};

export function WorkspaceTopbar({
  section,
  page,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
}: WorkspaceTopbarProps) {
  const { session, signOut, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const token = session?.access_token;
  const params = useParams<{ workspaceId?: string }>();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const workspaceIdParam = params?.workspaceId;
  const workspaceId = useMemo(
    () => (Array.isArray(workspaceIdParam) ? workspaceIdParam[0] : workspaceIdParam),
    [workspaceIdParam],
  );
  const workspace = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api.getWorkspace(token!, workspaceId!),
    enabled: Boolean(token && workspaceId),
  });
  const access = useWorkspaceAccessOptional();
  const notifications = useNotifications(workspaceId);
  const notifUnread = notifications.unreadCount > 0;
  const closeNotifications = useCallback(() => setNotifOpen(false), []);
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(token!),
    enabled: Boolean(token),
  });

  const breadcrumbSection = workspace.data?.name?.trim() || section;
  const hasSearch = typeof onSearchChange === 'function';
  const resolvedUserName = resolveDisplayName(
    {
      full_name:
        meQuery.data?.full_name ??
        (typeof user?.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : null),
      name:
        typeof user?.user_metadata?.name === 'string' ? user.user_metadata.name : null,
      email: meQuery.data?.email ?? user?.email ?? null,
      avatar_url: meQuery.data?.avatar_url ?? null,
      user_metadata: user?.user_metadata ?? null,
    },
    'User',
  );
  const resolvedUserAvatarUrl = resolveAvatarUrl({
    avatar_url: meQuery.data?.avatar_url ?? null,
    email: meQuery.data?.email ?? user?.email ?? null,
    user_metadata: user?.user_metadata ?? null,
  });
  const returnTo = useMemo(() => {
    const query = searchParams?.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current) return;
      const target = event.target as Node | null;
      if (target && !menuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [userMenuOpen]);

  const mobileMenuOpen = mobileOpen;

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false);
    }
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [mobileMenuOpen]);

  async function handleLogout() {
    if (logoutPending) return;
    setLogoutPending(true);
    try {
      await signOut();
      router.replace('/signin');
    } finally {
      setLogoutPending(false);
      setUserMenuOpen(false);
      setMobileOpen(false);
    }
  }

  const workspaceLinks = workspaceId
    ? WORKSPACE_NAV.filter((item) => access?.can(item.access) ?? true).map((item) => {
        const href = `/w/${workspaceId}/${item.href}`;
        const active = pathname?.startsWith(href) ?? false;
        return { key: item.key, label: item.label, href, active, icon: item.icon };
      })
    : [];
  const appLinks = [
    {
      key: 'workspaces',
      label: 'Workspaces',
      href: '/workspaces',
      active: pathname === '/workspaces',
      icon: LayoutGrid,
    },
    {
      key: 'docs',
      label: 'Docs',
      href: '/docs',
      active: (pathname?.startsWith('/docs') ?? false),
      icon: BookOpenText,
    },
  ] as const;

  return (
    <>
      <section className="hierarchy-topbar">
        <div className="hierarchy-breadcrumb">
          <span>{breadcrumbSection}</span>
          <i>/</i>
          <strong>{page}</strong>
        </div>
        <div className="hierarchy-topbar-right">
          {hasSearch ? (
            <label className="hierarchy-search">
              <Search size={14} />
              <input
                value={searchValue ?? ''}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
              />
            </label>
          ) : null}
          <div className="hierarchy-top-links">
            <Link href="/docs">Docs</Link>
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(false);
                setFeedbackOpen(true);
              }}
            >
              Feedback
            </button>
            <button
              type="button"
              className="hierarchy-theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            </button>
            <button
              type="button"
              className={`hierarchy-theme-toggle hierarchy-bell${notifUnread ? ' has-unread' : ''}`}
              aria-label={notifOpen ? 'Close notifications' : 'Open notifications'}
              aria-expanded={notifOpen}
              title={notifOpen ? 'Close notifications' : 'Notifications'}
              onClick={() => setNotifOpen((current) => !current)}
            >
              <Bell size={14} />
            </button>
            <div className="hierarchy-user-menu" ref={menuRef}>
              <button
                type="button"
                className="hierarchy-user"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label={`Open user menu for ${resolvedUserName}`}
                onClick={() => setUserMenuOpen((current) => !current)}
              >
                  <UserAvatar
                    name={resolvedUserName}
                    email={meQuery.data?.email ?? user?.email ?? null}
                    avatarUrl={resolvedUserAvatarUrl}
                    alt={resolvedUserName}
                    size={24}
                />
              </button>
              {userMenuOpen ? (
                <div className="hierarchy-user-dropdown" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false);
                      router.push(`/account?from=${encodeURIComponent(returnTo)}`);
                    }}
                  >
                    Account
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void handleLogout();
                    }}
                    disabled={logoutPending}
                  >
                    {logoutPending ? 'Logging out...' : 'Log out'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="hierarchy-mobile-menu-toggle"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
          aria-controls="workspace-mobile-menu"
          onClick={() => {
            setMobileOpen((current) => !current);
          }}
        >
          {mobileMenuOpen ? <X size={15} /> : <Menu size={15} />}
        </button>
      </section>

      {mobileMenuOpen ? (
        <div
          className="hierarchy-mobile-overlay"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      ) : null}
      <aside
        id="workspace-mobile-menu"
        className={`hierarchy-mobile-drawer${mobileMenuOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Workspace menu"
        aria-hidden={!mobileMenuOpen || undefined}
        inert={!mobileMenuOpen || undefined}
      >
          <div className="hierarchy-mobile-head">
            <div className="hierarchy-mobile-title">
              <span className="hierarchy-mobile-ws">{breadcrumbSection}</span>
              <span className="hierarchy-mobile-sep" aria-hidden="true">/</span>
              <span className="hierarchy-mobile-page">{page}</span>
            </div>
            <button
              type="button"
              className="hierarchy-mobile-close"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              tabIndex={mobileMenuOpen ? 0 : -1}
            >
              <X size={15} />
            </button>
          </div>
          {hasSearch ? (
            <div className="hierarchy-mobile-search-wrap">
              <label className="hierarchy-mobile-search">
                <Search size={14} aria-hidden="true" />
                <input
                  value={searchValue ?? ''}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  tabIndex={mobileMenuOpen ? 0 : -1}
                />
              </label>
            </div>
          ) : null}
          <div className="hierarchy-mobile-body">
          {workspaceLinks.length ? (
            <section aria-label="Workspace navigation">
              <p className="hierarchy-mobile-kicker">Workspace</p>
              <nav className="hierarchy-mobile-nav">
                {workspaceLinks.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={item.active ? 'active' : ''}
                    aria-current={item.active ? 'page' : undefined}
                    onClick={() => setMobileOpen(false)}
                    tabIndex={mobileMenuOpen ? 0 : -1}
                  >
                    <item.icon size={17} strokeWidth={1.8} aria-hidden="true" />
                    <span className="hierarchy-mobile-label">{item.label}</span>
                  </Link>
                ))}
              </nav>
            </section>
          ) : null}
          <section aria-label="General navigation">
            <p className="hierarchy-mobile-kicker">General</p>
            <div className="hierarchy-mobile-app-links">
              {appLinks.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className={item.active ? 'active' : ''}
                  onClick={() => setMobileOpen(false)}
                  tabIndex={mobileMenuOpen ? 0 : -1}
                >
                  <item.icon size={17} strokeWidth={1.8} aria-hidden="true" />
                  <span className="hierarchy-mobile-label">{item.label}</span>
                </Link>
              ))}
              {workspaceId ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    setConnectOpen(true);
                  }}
                  tabIndex={mobileMenuOpen ? 0 : -1}
                >
                  <Terminal size={17} strokeWidth={1.8} aria-hidden="true" />
                  <span className="hierarchy-mobile-label">MCP & CLI</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  setMobileOpen(false);
                  setFeedbackOpen(true);
                }}
                tabIndex={mobileMenuOpen ? 0 : -1}
              >
                <MessageSquareText size={17} strokeWidth={1.8} aria-hidden="true" />
                <span className="hierarchy-mobile-label">Feedback</span>
              </button>
            </div>
          </section>
          </div>
          <div className="hierarchy-mobile-foot">
            <div className="hierarchy-mobile-user">
              <UserAvatar
                name={resolvedUserName}
                email={meQuery.data?.email ?? user?.email ?? null}
                avatarUrl={resolvedUserAvatarUrl}
                className="hierarchy-mobile-avatar"
                alt={resolvedUserName}
                size={30}
              />
              <span className="hierarchy-mobile-user-meta">
                <strong>{resolvedUserName}</strong>
              </span>
              <button
                type="button"
                className="hierarchy-mobile-icon-btn"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                tabIndex={mobileMenuOpen ? 0 : -1}
              >
                {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
              </button>
              <button
                type="button"
                className="hierarchy-mobile-icon-btn"
                onClick={() => {
                  setMobileOpen(false);
                  router.push(`/account?from=${encodeURIComponent(returnTo)}`);
                }}
                aria-label="Account settings"
                title="Account settings"
                tabIndex={mobileMenuOpen ? 0 : -1}
              >
                <UserRound size={15} />
              </button>
              <button
                type="button"
                className="hierarchy-mobile-icon-btn danger"
                onClick={() => {
                  void handleLogout();
                }}
                disabled={logoutPending}
                aria-label="Log out"
                title="Log out"
                tabIndex={mobileMenuOpen ? 0 : -1}
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>

      <NotificationSidebar
        open={notifOpen}
        onClose={closeNotifications}
        items={notifications.items}
        isLoading={notifications.isLoading}
        onMarkRead={notifications.markRead}
        onMarkAllRead={notifications.markAllRead}
      />

      {workspaceId ? (
        <ConnectModal open={connectOpen} onOpenChange={setConnectOpen} workspaceId={workspaceId} />
      ) : null}

      <FeedbackModal
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        userName={resolvedUserName}
        userEmail={meQuery.data?.email ?? user?.email ?? null}
        contextLabel={`${breadcrumbSection} / ${page}`}
        contextPath={returnTo}
      />
    </>
  );
}
