import type {Metadata} from 'next';
import {hasLocale} from 'next-intl';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {PublicFooter} from '@/components/public-footer';
import {PublicSiteHeader} from '@/components/public-site-header';
import {routing} from '@/i18n/routing';
import '../../auth-page.css';
import '../../public-tokens.css';
import '../../public-motion.css';

export async function generateMetadata(): Promise<Metadata> {
  const tCommon = await getTranslations('common');

  return {
    title: tCommon('metadata.authTitle'),
    description: tCommon('metadata.authDescription'),
  };
}

export default async function PublicAuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params?: Promise<{locale?: string}>;
}) {
  const resolvedParams = (await params) ?? {};
  const rawLocale = resolvedParams.locale;
  const locale = hasLocale(routing.locales, rawLocale)
    ? rawLocale
    : routing.defaultLocale;
  setRequestLocale(locale);

  const [tCommon, tFooter, tHeader] = await Promise.all([
    getTranslations('common'),
    getTranslations('footer'),
    getTranslations('header'),
  ]);

  return (
    <div className="ap-page">
      <PublicSiteHeader />
      {children}
      <PublicFooter
        variant="ap"
        brand={tCommon('brand')}
        copy={tFooter('copy', {year: new Date().getFullYear()})}
        navAriaLabel={tFooter('navAriaLabel')}
        localeAriaLabel={tHeader('language.label')}
        sections={[
          {
            title: tFooter('siteMap'),
            links: [
              {href: '/docs', label: tHeader('nav.docs')},
              {href: '/license', label: tHeader('nav.license')},
              {href: '/signin', label: tHeader('actions.signIn')},
              {href: '/signup', label: tHeader('actions.getStarted')},
            ],
          },
        ]}
      />
    </div>
  );
}
