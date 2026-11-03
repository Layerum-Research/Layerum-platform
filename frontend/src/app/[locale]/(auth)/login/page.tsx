import {redirect} from '@/i18n/navigation';

export default async function LocalizedLoginAliasPage({
  params,
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  redirect({href: '/signin', locale});
}
