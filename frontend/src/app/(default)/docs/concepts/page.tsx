import LocaleDocsConceptsPage from '@/app/[locale]/docs/concepts/page';
import {routing} from '@/i18n/routing';

export default function DefaultDocsConceptsPage() {
  return (
    <LocaleDocsConceptsPage
      params={Promise.resolve({locale: routing.defaultLocale})}
    />
  );
}
