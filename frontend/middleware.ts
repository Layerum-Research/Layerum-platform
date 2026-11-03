import createMiddleware from 'next-intl/middleware';
import {routing} from './src/i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: [
    '/',
    '/docs/:path*',
    '/license',
    '/signin',
    '/signup',
    '/(en|ja|zh-CN|ko|es|fr|it|pl|nl|de)/:path*',
  ],
};
