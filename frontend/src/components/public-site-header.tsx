'use client';

import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import {useTranslations} from 'next-intl';
import { BookOpenText, ChevronRight, LogIn, Menu, Scale, UserPlus, X } from 'lucide-react';
import {Link} from '@/i18n/navigation';
import Image from 'next/image';
import { routing, type AppLocale } from '@/i18n/routing';
import { useAuth } from '@/providers/auth-provider';
import { LocaleSelector } from '@/components/locale-selector';
import { PublicThemeToggle } from '@/components/public/theme-toggle';
import styles from './public-site-header.module.css';

type PublicNavItem = 'docs' | 'license' | null;

function normalizePathname(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  const firstSegment = segments[0];
  const hasLocalePrefix = routing.locales.includes(firstSegment as AppLocale);
  if (!hasLocalePrefix) return pathname;
  const normalized = `/${segments.slice(1).join('/')}`;
  return normalized === '/' ? '/' : normalized;
}

function inferActiveFromPath(pathname: string): PublicNavItem {
  if (pathname === '/docs' || pathname.startsWith('/docs/')) return 'docs';
  if (pathname === '/license') return 'license';
  return null;
}

export function PublicSiteHeader({
  active,
  showLocale = true,
}: {
  active?: PublicNavItem;
  showLocale?: boolean;
}) {
  const t = useTranslations('header');
  const pathname = usePathname();
  const { session, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const userName =
    typeof user?.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : typeof user?.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : 'User';
  const userEmail = user?.email ?? '';
  const navItems = [
    { key: 'docs', href: '/docs', label: t('nav.docs'), icon: BookOpenText },
    { key: 'license', href: '/license', label: t('nav.license'), icon: Scale },
  ] as const;
  const resolvedActive = useMemo(() => {
    if (active !== undefined) return active;
    return inferActiveFromPath(normalizePathname(pathname));
  }, [active, pathname]);

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

  return (
    <header className={`${styles.topNav}${scrolled ? ` ${styles.scrolled}` : ''}`} data-scrolled={scrolled || undefined}>
      <div className={styles.inner}>
        <Link className={styles.logo} href="/signin">
          <Image src="/logo.png" alt="Layerum" width={22} height={22} priority />
          <span>Layerum</span>
        </Link>

        <nav className={styles.links} aria-label={t('aria.primaryNav')}>
          {navItems.map((item) => (
            <Link className={resolvedActive === item.key ? styles.active : ''} href={item.href} key={item.key}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <PublicThemeToggle label={t('theme.toggle')} />
          {!session ? (
            <>
              <Link className={styles.signin} href="/signin">
                {t('actions.signIn')}
              </Link>
              <Link className={styles.getStarted} href="/signup">
                {t('actions.getStarted')}
              </Link>
            </>
          ) : (
            <NextLink className={styles.userLink} href="/workspaces">
              <span className={styles.userName}>{userName}</span>
              <span className={styles.userEmail}>{userEmail}</span>
            </NextLink>
          )}
        </div>

        <div className={styles.mobileCluster}>
          <PublicThemeToggle label={t('theme.toggle')} />
          <button
            type="button"
            className={styles.menuToggle}
            aria-label={mobileMenuOpen ? t('menu.close') : t('menu.open')}
          aria-expanded={mobileMenuOpen}
          aria-controls="public-mobile-menu"
          onClick={() => {
            setMobileOpen((current) => !current);
          }}
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className={styles.mobileOverlay} onClick={() => setMobileOpen(false)} aria-hidden="true" />
      ) : null}
      <aside
        id="public-mobile-menu"
        className={`${styles.mobileDrawer}${mobileMenuOpen ? ` ${styles.mobileDrawerOpen}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('menu.label')}
        aria-hidden={!mobileMenuOpen || undefined}
        inert={!mobileMenuOpen || undefined}
      >
          <div className={styles.mobileDrawerHead}>
            <span className={styles.mobileEyebrow}>{t('menu.label')}</span>
            <button
              type="button"
              className={styles.mobileClose}
              aria-label={t('menu.close')}
              onClick={() => setMobileOpen(false)}
              tabIndex={mobileMenuOpen ? 0 : -1}
            >
              <X size={15} />
            </button>
          </div>
          <nav className={styles.mobileLinks} aria-label={t('aria.mobileNav')}>
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`${styles.mobileLink}${resolvedActive === item.key ? ` ${styles.mobileActive}` : ''}`}
                aria-current={resolvedActive === item.key ? 'page' : undefined}
                onClick={() => setMobileOpen(false)}
                tabIndex={mobileMenuOpen ? 0 : -1}
              >
                <item.icon size={17} strokeWidth={1.8} aria-hidden="true" />
                <span className={styles.mobileLinkLabel}>{item.label}</span>
                <ChevronRight size={14} className={styles.mobileLinkChevron} aria-hidden="true" />
              </Link>
            ))}
          </nav>
          <div className={styles.mobileDivider} aria-hidden="true" />
          {!session ? (
            <div className={styles.mobileCtaRow}>
              <Link
                href="/signin"
                className={styles.mobileSignin}
                onClick={() => setMobileOpen(false)}
                tabIndex={mobileMenuOpen ? 0 : -1}
              >
                <LogIn size={14} aria-hidden="true" />
                {t('actions.signIn')}
              </Link>
              <Link
                href="/signup"
                className={styles.mobilePrimary}
                onClick={() => setMobileOpen(false)}
                tabIndex={mobileMenuOpen ? 0 : -1}
              >
                <UserPlus size={14} aria-hidden="true" />
                {t('actions.getStarted')}
              </Link>
            </div>
          ) : (
            <NextLink
              href="/workspaces"
              className={styles.mobileUserRow}
              onClick={() => setMobileOpen(false)}
              tabIndex={mobileMenuOpen ? 0 : -1}
            >
              <span className={styles.mobileAvatar} aria-hidden="true">
                {userName.slice(0, 1).toUpperCase()}
              </span>
              <span className={styles.mobileUserMeta}>
                <span className={styles.userName}>{userName}</span>
                <span className={styles.userEmail}>{userEmail}</span>
              </span>
              <ChevronRight size={14} className={styles.mobileLinkChevron} aria-hidden="true" />
            </NextLink>
          )}
          {showLocale ? (
            <div className={styles.mobileLocale}>
              <LocaleSelector label={t('language.label')} />
            </div>
          ) : null}
        </aside>
    </header>
  );
}
