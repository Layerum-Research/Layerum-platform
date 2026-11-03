import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { buildContentSecurityPolicy } from './csp.config.js';

const nextConfig: NextConfig = {
  reactCompiler: true,
  ...(process.env.NEXT_OUTPUT === 'standalone' && {output: 'standalone' as const}),
  poweredByHeader: false,
  async headers() {
    const csp = buildContentSecurityPolicy();

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: csp,
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
