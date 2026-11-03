import type {MetadataRoute} from 'next';
import {routing} from '@/i18n/routing';
import {PUBLIC_PATHS, SITE_URL} from '@/lib/site';

function localizedUrl(locale: string, path: string) {
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`;
  return `${SITE_URL}${prefix}${path === '/' ? '' : path}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: localizedUrl(routing.defaultLocale, path),
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, localizedUrl(locale, path)]),
      ),
    },
  }));
}
