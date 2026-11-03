import type {Metadata, Viewport} from 'next';
import {Manrope} from 'next/font/google';
import Script from 'next/script';
import {getLocale, getTranslations} from 'next-intl/server';
import './globals.css';
import {AppProviders} from '@/providers/app-providers';
import {SITE_URL} from '@/lib/site';

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const tCommon = await getTranslations('common');

  return {
    metadataBase: new URL(SITE_URL),
    title: tCommon('metadata.title'),
    description: tCommon('metadata.description'),
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon.ico',
      apple: '/favicon.ico',
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={manrope.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
