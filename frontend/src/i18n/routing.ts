import {defineRouting} from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'ja', 'zh-CN', 'ko', 'es', 'fr', 'it', 'pl', 'nl', 'de'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',
  localeDetection: true,
});

export type AppLocale = (typeof routing.locales)[number];
