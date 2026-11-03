export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

export const PUBLIC_PATHS = [
  '/docs',
  '/docs/concepts',
  '/docs/reference',
  '/license',
] as const;
