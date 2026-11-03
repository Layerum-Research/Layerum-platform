import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import { LocaleSelector } from '@/components/locale-selector';

export type PublicFooterVariant = 'pp' | 'ap';

export type PublicFooterLink = {
  href: string;
  label: string;
};

export type PublicFooterSection = {
  title: string;
  links: PublicFooterLink[];
};

export function PublicFooter({
  variant,
  brand,
  copy,
  sections,
  navAriaLabel = 'Footer links',
  localeAriaLabel,
  showLocaleSelector = true,
}: {
  variant: PublicFooterVariant;
  brand: string;
  copy: string;
  sections: PublicFooterSection[];
  navAriaLabel?: string;
  localeAriaLabel?: string;
  showLocaleSelector?: boolean;
}) {
  const classPrefix = variant;

  return (
    <footer className={`${classPrefix}-footer`}>
      <div className={`${classPrefix}-footer-inner`}>
        <div>
          <p className={`${classPrefix}-footer-brand`}>
            <Image src="/logo.png" alt="" width={20} height={20} aria-hidden="true" />
            <span>{brand}</span>
          </p>
          <p className={`${classPrefix}-footer-copy`}>{copy}</p>
          {showLocaleSelector ? <LocaleSelector ariaLabel={localeAriaLabel} /> : null}
        </div>
        <nav aria-label={navAriaLabel} className={`${classPrefix}-footer-nav`}>
          {sections.map((section, sectionIndex) => (
            <div className={`${classPrefix}-footer-section`} key={`${section.title}-${sectionIndex}`}>
              <p>{section.title}</p>
              {section.links.map((link) => (
                <Link href={link.href} key={`${link.href}-${link.label}`}>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}
