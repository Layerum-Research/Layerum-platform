import LocaleLicensePage, {generateMetadata as generateLocaleMetadata} from '@/app/[locale]/license/page';
import {routing} from '@/i18n/routing';

const defaultParams = () => Promise.resolve({locale: routing.defaultLocale});

export function generateMetadata() {
  return generateLocaleMetadata({params: defaultParams()});
}

export default function DefaultLicensePage() {
  return <LocaleLicensePage params={defaultParams()} />;
}
