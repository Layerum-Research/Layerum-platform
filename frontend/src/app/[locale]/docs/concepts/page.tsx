import { Link } from "@/i18n/navigation";
import { hasLocale } from "next-intl";
import { routing, type AppLocale } from "@/i18n/routing";
import { CodeBlock } from "../reference/code-block";
import { Reveal } from "@/components/public/reveal";
import { env } from "@/lib/env";
import "../reference/reference-page.css";

const withApiBaseUrl = (text: string) => text.replaceAll("{apiBaseUrl}", env.apiBaseUrl);

function BreadcrumbArrow() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="4" height="6" viewBox="0 0 4 6" fill="none">
      <path d="M2.3 3L0 0.7L0.7 0L3.7 3L0.7 6L0 5.3L2.3 3Z" fill="#C7C4D7" />
    </svg>
  );
}

type SidebarLink = { href: string; label: string };
type SectionContent = {
  title: string;
  paragraph?: string;
  bullets: string[];
  sdkFlowCode?: string;
  referenceLinkLabel?: string;
};

type DocsConceptsMessages = {
  breadcrumb: {
    docs: string;
    current: string;
  };
  hero: {
    title: string;
    description: string;
  };
  sidebar: {
    title: string;
    ariaLabel: string;
    links: SidebarLink[];
  };
  sections: {
    whatLayerumIs: SectionContent;
    workspaceModel: SectionContent;
    dataModel: SectionContent;
    ingestionLifecycle: SectionContent;
    capacityControl: SectionContent;
    securityGovernance: SectionContent;
    retrievalQuality: SectionContent;
    developerExperience: SectionContent;
    operations: SectionContent;
    useCases: SectionContent;
    start: SectionContent;
  };
};

async function loadDocsConceptsMessages(locale: string): Promise<DocsConceptsMessages> {
  try {
    const mod = await import(`../../../../../messages/${locale}/docsConcepts.json`);
    return mod.default as DocsConceptsMessages;
  } catch {
    const fallback = await import(
      `../../../../../messages/${routing.defaultLocale}/docsConcepts.json`
    );
    return fallback.default as DocsConceptsMessages;
  }
}

export default async function DocsConceptsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const resolvedLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const activeLocale = resolvedLocale as AppLocale;
  const linkLocale = activeLocale === routing.defaultLocale ? undefined : activeLocale;

  const docsConcepts = await loadDocsConceptsMessages(resolvedLocale);

  const sections = docsConcepts.sections;

  return (
    <main className="dp-main dr-main">
        <Reveal>
          <div className="dp-breadcrumbs">
            <Link href="/docs" locale={linkLocale}>{docsConcepts.breadcrumb.docs}</Link>
            <BreadcrumbArrow />
            <span className="active">{docsConcepts.breadcrumb.current}</span>
          </div>

          <section className="dp-hero dr-hero">
            <h1>{docsConcepts.hero.title}</h1>
            <p>{docsConcepts.hero.description}</p>
          </section>
        </Reveal>

        <Reveal y={14}>
        <section className="dr-layout">
          <aside className="dr-sidebar" aria-label={docsConcepts.sidebar.ariaLabel}>
            <h3>{docsConcepts.sidebar.title}</h3>
            <nav>
              {docsConcepts.sidebar.links.map((link) => (
                <a key={link.href} href={link.href}>
                  {link.label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="dr-content">
            <section id="what-layerum-is" className="dr-section">
              <h2>{sections.whatLayerumIs.title}</h2>
              <p>{sections.whatLayerumIs.paragraph}</p>
              <ul>
                {sections.whatLayerumIs.bullets.map((bullet) => (
                  <li key={bullet}>{withApiBaseUrl(bullet)}</li>
                ))}
              </ul>
            </section>

            <section id="workspace-model" className="dr-section">
              <h2>{sections.workspaceModel.title}</h2>
              <p>{sections.workspaceModel.paragraph}</p>
              <ul>
                {sections.workspaceModel.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </section>

            <section id="data-model" className="dr-section">
              <h2>{sections.dataModel.title}</h2>
              <p>{sections.dataModel.paragraph}</p>
              <ul>
                {sections.dataModel.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </section>

            <section id="ingestion-lifecycle" className="dr-section">
              <h2>{sections.ingestionLifecycle.title}</h2>
              <p>{sections.ingestionLifecycle.paragraph}</p>
              <ul>
                {sections.ingestionLifecycle.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </section>

            <section id="capacity-control" className="dr-section">
              <h2>{sections.capacityControl.title}</h2>
              <p>{sections.capacityControl.paragraph}</p>
              <ul>
                {sections.capacityControl.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </section>

            <section id="security-governance" className="dr-section">
              <h2>{sections.securityGovernance.title}</h2>
              <p>{sections.securityGovernance.paragraph}</p>
              <ul>
                {sections.securityGovernance.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </section>

            <section id="retrieval-quality" className="dr-section">
              <h2>{sections.retrievalQuality.title}</h2>
              <p>{sections.retrievalQuality.paragraph}</p>
              <ul>
                {sections.retrievalQuality.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </section>

            <section id="developer-experience" className="dr-section">
              <h2>{sections.developerExperience.title}</h2>
              <p>{sections.developerExperience.paragraph}</p>
              <ul>
                {sections.developerExperience.bullets.map((bullet) => (
                  <li key={bullet}>{withApiBaseUrl(bullet)}</li>
                ))}
              </ul>
              <CodeBlock lang="ts" code={withApiBaseUrl(sections.developerExperience.sdkFlowCode ?? "")} />
            </section>

            <section id="operations" className="dr-section">
              <h2>{sections.operations.title}</h2>
              <p>{sections.operations.paragraph}</p>
              <ul>
                {sections.operations.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </section>

            <section id="use-cases" className="dr-section">
              <h2>{sections.useCases.title}</h2>
              <ul>
                {sections.useCases.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </section>

            <section id="start" className="dr-section">
              <h2>{sections.start.title}</h2>
              <ul>
                {sections.start.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <p>
                {sections.start.paragraph}{" "}
                <Link href="/docs/reference" locale={linkLocale}>{sections.start.referenceLinkLabel}</Link>.
              </p>
            </section>
          </article>
        </section>
        </Reveal>
    </main>
  );
}
