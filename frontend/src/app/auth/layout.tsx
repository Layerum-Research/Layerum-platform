import {NextIntlClientProvider} from 'next-intl';
import {getMessages, setRequestLocale} from 'next-intl/server';
import {routing} from '@/i18n/routing';
import '../auth-page.css';

export default async function AuthLayout({
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
