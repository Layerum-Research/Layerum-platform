import type {Metadata} from 'next';
import {hasLocale} from 'next-intl';
import {getTranslations} from 'next-intl/server';
import {LICENSE_TEXT} from '@/content/license-text';
import {routing} from '@/i18n/routing';

type LicensePageProps = {params: Promise<{locale: string}>};

type LicenseBlock = {kind: 'heading' | 'paragraph'; text: string};

function parseLicense(text: string): LicenseBlock[] {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) =>
      block.startsWith('## ')
        ? {kind: 'heading', text: block.slice(3).trim()}
        : {kind: 'paragraph', text: block.replace(/\s*\n\s*/g, ' ')},
    );
}

async function getHeaderTranslations(params: LicensePageProps['params']) {
  const {locale} = await params;
  return getTranslations({
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
    namespace: 'header',
  });
}

function renderInline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      if (part.length > 1 && part.startsWith('*') && part.endsWith('*')) {
        return <em key={index}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
}

export async function generateMetadata({params}: LicensePageProps): Promise<Metadata> {
  const tHeader = await getHeaderTranslations(params);

  return {
    title: tHeader('nav.license'),
  };
}

export default async function LicensePage({params}: LicensePageProps) {
  const tHeader = await getHeaderTranslations(params);
  const blocks = parseLicense(LICENSE_TEXT);

  return (
    <main className="dp-main">
      <section className="dp-hero">
        <h1>{tHeader('nav.license')}</h1>
      </section>
      <article className="dp-license">
        {blocks.map((block, index) =>
          block.kind === 'heading' ? (
            <h2 key={index}>{block.text}</h2>
          ) : (
            <p key={index}>{renderInline(block.text)}</p>
          ),
        )}
      </article>
    </main>
  );
}
