import {NextIntlClientProvider} from 'next-intl';
import {getMessages, setRequestLocale} from 'next-intl/server';
import {routing} from '@/i18n/routing';

export default async function DefaultLocaleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  setRequestLocale(routing.defaultLocale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={routing.defaultLocale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
