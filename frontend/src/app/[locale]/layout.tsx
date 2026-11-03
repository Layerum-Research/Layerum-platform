import {NextIntlClientProvider, hasLocale} from 'next-intl';
import {setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {routing} from '@/i18n/routing';

const namespaces = [
  'common',
  'header',
  'footer',
  'docs',
  'signin',
  'signup',
  'docsReference',
  'docsConcepts',
] as const;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}

async function loadMessages(locale: string) {
  return Object.fromEntries(
    await Promise.all(
      namespaces.map(async (namespace) => {
        try {
          const mod = await import(`../../../messages/${locale}/${namespace}.json`);
          return [namespace, mod.default];
        } catch {
          const fallback = await import(`../../../messages/${routing.defaultLocale}/${namespace}.json`);
          return [namespace, fallback.default];
        }
      }),
    ),
  );
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await loadMessages(locale);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
