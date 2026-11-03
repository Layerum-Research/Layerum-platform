import { Link } from "@/i18n/navigation";
import { hasLocale } from "next-intl";
import { routing, type AppLocale } from "@/i18n/routing";
import { CopyCodeButton } from "./copy-code-button";
import { env } from "@/lib/env";
import { CLAUDE_CODE_CODE, CLI_LOGIN_CODE, MCP_CONFIG_CODE } from "@/lib/cli-snippets";
import { Reveal, Stagger, StaggerItem } from "@/components/public/reveal";

export const IMG_BREADCRUMB_ARROW = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="4"
      height="6"
      viewBox="0 0 4 6"
      fill="none"
    >
      <path d="M2.3 3L0 0.7L0.7 0L3.7 3L0.7 6L0 5.3L2.3 3Z" fill="#C7C4D7" />
    </svg>
  );
};

const IMG_STEP_ARROW = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M12.175 9H0V7H12.175L6.575 1.4L8 0L16 8L8 16L6.575 14.6L12.175 9Z"
        fill="#C0C1FF"
      />
    </svg>
  );
};

const IMG_LINK_PURPLE = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
    >
      <path
        d="M7.10208 5.25H0V4.08333H7.10208L3.83542 0.816667L4.66667 0L9.33333 4.66667L4.66667 9.33333L3.83542 8.51667L7.10208 5.25Z"
        fill="#C0C1FF"
      />
    </svg>
  );
};
const IMG_LINK_ORANGE = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
    >
      <path
        d="M7.10208 5.25H0V4.08333H7.10208L3.83542 0.816667L4.66667 0L9.33333 4.66667L4.66667 9.33333L3.83542 8.51667L7.10208 5.25Z"
        fill="#FFB783"
      />
    </svg>
  );
};

const INSTALL_CODE = `npm i @layerum-team/rag-sdk`;

const CLI_INSTALL_CODE = `npm i -g @layerum-team/cli`;

const CLIENT_CODE = `import { LayerumClient } from '@layerum-team/rag-sdk';

const client = new LayerumClient({
  apiKey: process.env.LAYERUM_API_KEY!, // lyr_wk_...
  baseUrl: '${env.apiBaseUrl}'
});
`;

type DocsMessages = {
  hero: {
    breadcrumbRoot: string;
    breadcrumbActive: string;
    title: string;
    description: string;
  };
  steps: {
    apiKeys: { label: string; title: string; desc: string };
    sdk: { label: string; title: string; desc: string };
    api: { label: string; title: string; desc: string };
  };
  sections: {
    install: { title: string; desc: string };
    client: { title: string; desc: string };
    mcpCli: {
      title: string;
      desc: string;
      install: { title: string; desc: string };
      signIn: { title: string; desc: string };
      assistants: { title: string; desc: string; othersDesc: string };
      reference: string;
    };
  };
  cards: {
    sandbox: { title: string; desc: string; link: string };
    concepts: { title: string; desc: string; link: string };
  };
};

async function loadDocsMessages(locale: string): Promise<DocsMessages> {
  try {
    const mod = await import(`../../../../messages/${locale}/docs.json`);
    return mod.default as DocsMessages;
  } catch {
    const fallback = await import(
      `../../../../messages/${routing.defaultLocale}/docs.json`
    );
    return fallback.default as DocsMessages;
  }
}

export default async function DocsPage({
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
  const docs = await loadDocsMessages(resolvedLocale);

  const steps = [
    {
      key: "apiKeys",
      href: "/docs/reference#api-keys",
      label: docs.steps.apiKeys.label,
      title: docs.steps.apiKeys.title,
      description: docs.steps.apiKeys.desc,
    },
    {
      key: "sdk",
      href: "/docs/reference#sdk",
      label: docs.steps.sdk.label,
      title: docs.steps.sdk.title,
      description: docs.steps.sdk.desc,
    },
    {
      key: "api",
      href: "/docs/reference#api-public",
      label: docs.steps.api.label,
      title: docs.steps.api.title,
      description: docs.steps.api.desc,
    },
  ] as const;

  return (
    <main className="dp-main">
        <Reveal>
          <div className="dp-breadcrumbs">
            <span>{docs.hero.breadcrumbRoot}</span>
            <IMG_BREADCRUMB_ARROW />
            <span className="active">{docs.hero.breadcrumbActive}</span>
          </div>

          <section className="dp-hero">
            <h1>{docs.hero.title}</h1>
            <p>{docs.hero.description}</p>
          </section>
        </Reveal>

        <Stagger className="dp-steps-grid" aria-label="Key steps">
          {steps.map((step) => (
            <StaggerItem key={step.key}>
            <Link
              className="dp-step-card"
              href={step.href}
              locale={linkLocale}
              aria-label={`Open ${step.title} docs`}
            >
              <p className="dp-step-label">{step.label}</p>
              <h2>{step.title}</h2>
              <p>{step.description}</p>
              <span className="dp-step-link" aria-hidden="true">
                <IMG_STEP_ARROW />
              </span>
            </Link>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal>
        <section className="dp-section">
          <h3>{docs.sections.install.title}</h3>
          <p className="dp-body">{docs.sections.install.desc}</p>
          <article className="dp-code-block">
            <div className="dp-code-head">
              <span>Bash</span>
              <CopyCodeButton className="dp-code-copy" code={INSTALL_CODE} />
            </div>
            <pre>
              <code>{INSTALL_CODE}</code>
            </pre>
          </article>
        </section>
        </Reveal>

        <Reveal>
        <section className="dp-section">
          <h3>{docs.sections.client.title}</h3>
          <p className="dp-body">{docs.sections.client.desc}</p>
          <article className="dp-code-block">
            <div className="dp-code-head">
              <span>Node.js</span>
              <CopyCodeButton className="dp-code-copy" code={CLIENT_CODE} />
            </div>
            <pre>
              <code>{CLIENT_CODE}</code>
            </pre>
          </article>
        </section>
        </Reveal>

        <Reveal>
        <section className="dp-section" id="mcp-cli">
          <h3>{docs.sections.mcpCli.title}</h3>
          <p className="dp-body">{docs.sections.mcpCli.desc}</p>

          <h4>{docs.sections.mcpCli.install.title}</h4>
          <p className="dp-body">{docs.sections.mcpCli.install.desc}</p>
          <article className="dp-code-block">
            <div className="dp-code-head">
              <span>Bash</span>
              <CopyCodeButton className="dp-code-copy" code={CLI_INSTALL_CODE} />
            </div>
            <pre>
              <code>{CLI_INSTALL_CODE}</code>
            </pre>
          </article>

          <h4>{docs.sections.mcpCli.signIn.title}</h4>
          <p className="dp-body">{docs.sections.mcpCli.signIn.desc}</p>
          <article className="dp-code-block">
            <div className="dp-code-head">
              <span>Bash</span>
              <CopyCodeButton className="dp-code-copy" code={CLI_LOGIN_CODE} />
            </div>
            <pre>
              <code>{CLI_LOGIN_CODE}</code>
            </pre>
          </article>

          <h4>{docs.sections.mcpCli.assistants.title}</h4>
          <p className="dp-body">{docs.sections.mcpCli.assistants.desc}</p>
          <article className="dp-code-block">
            <div className="dp-code-head">
              <span>Claude Code</span>
              <CopyCodeButton className="dp-code-copy" code={CLAUDE_CODE_CODE} />
            </div>
            <pre>
              <code>{CLAUDE_CODE_CODE}</code>
            </pre>
          </article>
          <p className="dp-body">{docs.sections.mcpCli.assistants.othersDesc}</p>
          <article className="dp-code-block">
            <div className="dp-code-head">
              <span>JSON</span>
              <CopyCodeButton className="dp-code-copy" code={MCP_CONFIG_CODE} />
            </div>
            <pre>
              <code>{MCP_CONFIG_CODE}</code>
            </pre>
          </article>

          <Link className="dp-inline-link" href="/docs/reference#cli" locale={linkLocale}>
            {docs.sections.mcpCli.reference}
            <IMG_LINK_PURPLE />
          </Link>
        </section>
        </Reveal>

        <Stagger className="dp-link-cards">
          <StaggerItem>
          <article className="dp-link-card purple">
            <h3>{docs.cards.sandbox.title}</h3>
            <p>{docs.cards.sandbox.desc}</p>
            <Link href="/signin" locale={linkLocale} aria-label="Open playground">
              {docs.cards.sandbox.link}
              <IMG_LINK_PURPLE />
            </Link>
          </article>
          </StaggerItem>
          <StaggerItem>
          <article className="dp-link-card orange">
            <h3>{docs.cards.concepts.title}</h3>
            <p>{docs.cards.concepts.desc}</p>
            <Link href="/docs/concepts" locale={linkLocale} aria-label="Open core concepts">
              {docs.cards.concepts.link}
              <IMG_LINK_ORANGE />
            </Link>
          </article>
          </StaggerItem>
        </Stagger>
    </main>
  );
}
