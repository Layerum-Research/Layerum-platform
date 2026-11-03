import LocaleDocsPage from '@/app/[locale]/docs/page';
import {routing} from '@/i18n/routing';

export default function DefaultDocsPage() {
  return <LocaleDocsPage params={Promise.resolve({locale: routing.defaultLocale})} />;
}
