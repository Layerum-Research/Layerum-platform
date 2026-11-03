import type {Metadata} from 'next';
import {NextIntlClientProvider} from 'next-intl';
import {getMessages, setRequestLocale} from 'next-intl/server';
import {routing} from '@/i18n/routing';
import '../auth-page.css';
import '../public-tokens.css';
import './oauth.css';

export const metadata: Metadata = {
  title: 'Authorize Layerum CLI',
  robots: {index: false, follow: false},
};

export default async function OAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  setRequestLocale(routing.defaultLocale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={routing.defaultLocale} messages={messages}>
      <div className="ap-page">{children}</div>
    </NextIntlClientProvider>
  );
}
