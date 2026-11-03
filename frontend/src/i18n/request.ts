import {getRequestConfig} from 'next-intl/server';
import {hasLocale} from 'next-intl';
import {routing} from './routing';

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

export default getRequestConfig(async ({requestLocale}) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const messages = Object.fromEntries(
    await Promise.all(
      namespaces.map(async (namespace) => {
        try {
          const mod = await import(`../../messages/${locale}/${namespace}.json`);
          return [namespace, mod.default];
        } catch {
          const fallback = await import(
            `../../messages/${routing.defaultLocale}/${namespace}.json`
          );
          return [namespace, fallback.default];
        }
      })
    )
  );

  return {
    locale,
    messages,
  };
});
