import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { routing, type AppLocale } from "@/i18n/routing";
import { CodeBlock } from './code-block';
import { env } from '@/lib/env';
import { CLAUDE_CODE_CODE, CLI_LOGIN_CODE, MCP_CONFIG_CODE } from '@/lib/cli-snippets';
import { Reveal } from "@/components/public/reveal";
import './reference-page.css';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

type EndpointSpec = {
  method: HttpMethod;
  path: string;
  query?: string[];
  body?: string[];
  notes?: string[];
};

function BreadcrumbArrow() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="4" height="6" viewBox="0 0 4 6" fill="none">
      <path d="M2.3 3L0 0.7L0.7 0L3.7 3L0.7 6L0 5.3L2.3 3Z" fill="#C7C4D7" />
    </svg>
  );
}

function EndpointCard({ endpoint }: { endpoint: EndpointSpec }) {
  return (
    <article className="dr-endpoint">
      <div className="dr-endpoint-head">
        <span className={`dr-method dr-method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
        <code>{endpoint.path}</code>
      </div>

      {endpoint.query?.length ? (
        <div className="dr-endpoint-block">
          <h4>Query</h4>
          <ul>
            {endpoint.query.map((line) => (
              <li key={line}>
                <code>{line}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {endpoint.body?.length ? (
        <div className="dr-endpoint-block">
          <h4>Body</h4>
          <ul>
            {endpoint.body.map((line) => (
              <li key={line}>
                <code>{line}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {endpoint.notes?.length ? (
        <div className="dr-endpoint-block">
          <h4>Notes</h4>
          <ul>
            {endpoint.notes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function EndpointGroup({ endpoints }: { endpoints: EndpointSpec[] }) {
  return (
    <div className="dr-endpoint-grid">
      {endpoints.map((endpoint) => (
        <EndpointCard key={`${endpoint.method}:${endpoint.path}`} endpoint={endpoint} />
      ))}
    </div>
  );
}

const PUBLIC_ENTITIES: EndpointSpec[] = [
  { method: 'GET', path: '/v1/entities' },
  { method: 'GET', path: '/v1/entities/tree' },
  {
    method: 'POST',
    path: '/v1/entities',
    body: [
      'entity_type_id (uuid, required)',
      'name (string, required, max 200)',
      'description (string, optional)',
      'parent_id (uuid, optional)',
      'metadata (object, optional)',
    ],
    notes: ['Scoped API keys cannot create root entities unless scope allows it.'],
  },
  { method: 'DELETE', path: '/v1/entities/:id' },
];

const PUBLIC_ENTITY_TYPES: EndpointSpec[] = [
  { method: 'GET', path: '/v1/entity-types' },
  { method: 'GET', path: '/v1/entity-types/:id' },
  {
    method: 'POST',
    path: '/v1/entity-types',
    body: ['name (string, required, max 50)', 'label (string, required, max 100)'],
  },
  { method: 'DELETE', path: '/v1/entity-types/:id' },
];

const PUBLIC_DOCUMENTS: EndpointSpec[] = [
  { method: 'GET', path: '/v1/entities/:entityId/documents' },
  { method: 'GET', path: '/v1/documents' },
  { method: 'GET', path: '/v1/entities/:entityId/documents/:id' },
  {
    method: 'POST',
    path: '/v1/entities/:entityId/documents',
    body: [
      'source_type ("file" | "url" | "text", required)',
      'display_name (string, required)',
      'source_url (string, optional)',
      'raw_text (string, optional)',
      'visibility ("self" | "self_and_descendants", optional)',
      'model_config_id (uuid, optional)',
    ],
  },
  {
    method: 'POST',
    path: '/v1/entities/:entityId/documents/upload',
    body: [
      'multipart/form-data',
      'file (required)',
      'visibility (optional)',
      'model_config_id (optional)',
    ],
  },
  {
    method: 'POST',
    path: '/v1/entities/:entityId/documents/upload/init',
    body: [
      'file_name (string, required)',
      'file_size_bytes (int >= 1, required)',
      'content_type (string, optional)',
      'visibility ("self" | "self_and_descendants", optional)',
      'model_config_id (uuid, optional)',
    ],
  },
  {
    method: 'POST',
    path: '/v1/entities/:entityId/documents/upload/complete',
    body: [
      'upload_id (uuid, required)',
      'display_name (string, optional)',
      'visibility ("self" | "self_and_descendants", optional)',
      'model_config_id (uuid, optional)',
      'checksum (string, optional)',
    ],
    notes: ['Uploaded object size must exactly match file_size_bytes declared at upload/init.'],
  },
  { method: 'DELETE', path: '/v1/entities/:entityId/documents/:id' },
  { method: 'POST', path: '/v1/entities/:entityId/documents/:id/retry' },
  { method: 'GET', path: '/v1/entities/:entityId/documents/:id/error' },
];

const PUBLIC_MODELS: EndpointSpec[] = [
  { method: 'GET', path: '/v1/models' },
  { method: 'GET', path: '/v1/models/:id' },
  { method: 'POST', path: '/v1/models' },
  { method: 'PATCH', path: '/v1/models/:id' },
  { method: 'DELETE', path: '/v1/models/:id' },
  { method: 'GET', path: '/v1/model-definitions', query: ['type (string, optional)'] },
];

const PUBLIC_PROVIDERS: EndpointSpec[] = [
  { method: 'GET', path: '/v1/providers' },
  { method: 'GET', path: '/v1/providers/:id' },
  { method: 'POST', path: '/v1/providers' },
  { method: 'POST', path: '/v1/providers/:id/test' },
  { method: 'DELETE', path: '/v1/providers/:id' },
];

const PUBLIC_QUERY: EndpointSpec[] = [
  {
    method: 'POST',
    path: '/v1/query',
    body: [
      'entityId (uuid, required)',
      'modelConfigId (uuid, required)',
      'query (string, required)',
      'topK (number 1..20, optional)',
      'includeParentScopes (boolean, optional)',
    ],
  },
  {
    method: 'POST',
    path: '/v1/query/debug',
    body: [
      'entityId (uuid, required)',
      'modelConfigId (uuid, required)',
      'query (string, required)',
      'topK (number 1..20, optional)',
      'includeParentScopes (boolean, optional)',
    ],
    notes: ['Returns additional debug metadata when backend provides it.'],
  },
];

const CLI_COMMANDS: { key: string; command: string }[] = [
  { key: 'login', command: 'layerum login [--force] [--code]' },
  { key: 'logout', command: 'layerum logout' },
  { key: 'whoami', command: 'layerum whoami' },
  { key: 'workspaces', command: 'layerum workspaces' },
  { key: 'use', command: 'layerum use <workspace>' },
  { key: 'entities', command: 'layerum entities [--flat]' },
  { key: 'models', command: 'layerum models' },
  { key: 'documentsList', command: 'layerum documents list [--entity <id>]' },
  {
    key: 'documentsAdd',
    command:
      'layerum documents add --entity <id> (--text <s> | --url <u> | --file <path>) [--name <n>] [--wait]',
  },
  { key: 'documentsGet', command: 'layerum documents get <id> --entity <id>' },
  { key: 'documentsDelete', command: 'layerum documents delete <id> --entity <id> --yes' },
  {
    key: 'query',
    command: 'layerum query "<question>" --entity <id> [--model <id>] [--top-k <n>]',
  },
  { key: 'mcp', command: 'layerum mcp' },
];

const MCP_TOOLS: { key: string; name: string; inputs: string }[] = [
  { key: 'login', name: 'login', inputs: 'force?, method?' },
  { key: 'completeLogin', name: 'complete_login', inputs: 'code' },
  { key: 'whoami', name: 'whoami', inputs: '' },
  { key: 'listWorkspaces', name: 'list_workspaces', inputs: '' },
  { key: 'useWorkspace', name: 'use_workspace', inputs: 'workspace' },
  { key: 'listEntities', name: 'list_entities', inputs: 'workspace_id?' },
  { key: 'listModels', name: 'list_models', inputs: 'workspace_id?' },
  { key: 'listDocuments', name: 'list_documents', inputs: 'workspace_id?, entity_id?' },
  {
    key: 'getDocument',
    name: 'get_document',
    inputs: 'workspace_id?, entity_id, document_id',
  },
  {
    key: 'addText',
    name: 'add_text_document',
    inputs: 'workspace_id?, entity_id, name, text',
  },
  {
    key: 'addUrl',
    name: 'add_url_document',
    inputs: 'workspace_id?, entity_id, url, name?',
  },
  {
    key: 'query',
    name: 'query',
    inputs: 'workspace_id?, entity_id, question, model_config_id?, top_k?',
  },
];

const CLI_ENV: { key: string; name: string }[] = [
  { key: 'appUrl', name: 'LAYERUM_APP_URL' },
  { key: 'apiUrl', name: 'LAYERUM_API_URL' },
  { key: 'workspace', name: 'LAYERUM_WORKSPACE' },
  { key: 'xdg', name: 'XDG_CONFIG_HOME' },
  { key: 'appdata', name: 'APPDATA' },
];

const CLI_INSTALL_CODE = `npm i -g @layerum-team/cli`;

export default function DocsReferencePage() {
  const tDocsReference = useTranslations("docsReference");
  const activeLocale = useLocale() as AppLocale;
  const linkLocale = activeLocale === routing.defaultLocale ? undefined : activeLocale;
  const rich = (key: string): ReactNode =>
    tDocsReference.rich(key, {
      c: (chunks) => <code>{chunks}</code>,
      wsFlag: '--workspace <id>',
      useCmd: 'layerum use <workspace>',
    });

  return (
    <main className="dp-main dr-main">
        <Reveal>
          <div className="dp-breadcrumbs">
            <Link href="/docs" locale={linkLocale}>{tDocsReference("breadcrumb.docs")}</Link>
            <BreadcrumbArrow />
            <span className="active">{tDocsReference("breadcrumb.current")}</span>
          </div>

          <section className="dp-hero dr-hero">
            <h1>{tDocsReference("hero.title")}</h1>
            <p>{tDocsReference("hero.description")}</p>
          </section>
        </Reveal>

        <Reveal y={14}>
        <section className="dr-layout">
          <aside className="dr-sidebar" aria-label={tDocsReference("sidebar.ariaLabel")}>
            <h3>{tDocsReference("sidebar.title")}</h3>
            <nav>
              <a href="#api-keys">API Keys</a>
              <a href="#api-keys-limits">Capabilities, Scopes, Limits</a>
              <a href="#sdk">SDK</a>
              <a href="#sdk-client">SDK Client Options</a>
              <a href="#sdk-errors">SDK Error Handling</a>
              <a href="#sdk-entities">SDK Entities</a>
              <a href="#sdk-entity-types">SDK Entity Types</a>
              <a href="#sdk-documents">SDK Documents</a>
              <a href="#sdk-ingestion">SDK Ingestion</a>
              <a href="#sdk-query">SDK Query</a>
              <a href="#sdk-models">SDK Models</a>
              <a href="#sdk-providers">SDK Providers</a>
              <a href="#api-public">Public API (/v1)</a>
              <a href="#api-error">API Error Format</a>
              <a href="#api-public-entities">Public Entities</a>
              <a href="#api-public-entity-types">Public Entity Types</a>
              <a href="#api-public-documents">Public Documents</a>
              <a href="#api-public-models">Public Models</a>
              <a href="#api-public-providers">Public Providers</a>
              <a href="#api-public-query">Public Query</a>
              <a href="#capacity">Capacity and Upload Model</a>
              <a href="#cli">{tDocsReference("cli.nav.overview")}</a>
              <a href="#cli-auth">{tDocsReference("cli.nav.auth")}</a>
              <a href="#cli-workspace">{tDocsReference("cli.nav.workspace")}</a>
              <a href="#cli-commands">{tDocsReference("cli.nav.commands")}</a>
              <a href="#mcp-setup">{tDocsReference("cli.nav.mcp")}</a>
              <a href="#mcp-tools">{tDocsReference("cli.nav.tools")}</a>
              <a href="#cli-env">{tDocsReference("cli.nav.env")}</a>
              <a href="#cli-troubleshooting">{tDocsReference("cli.nav.troubleshooting")}</a>
            </nav>
          </aside>

          <article className="dr-content">
            <section id="api-keys" className="dr-section">
              <h2>API Keys</h2>
              <p>
                API keys are created and managed only through the Layerum platform UI. API and SDK integrations do
                not create keys directly.
              </p>
              <ul>
                <li>Sign in to Layerum and open workspace <code>API Keys</code>.</li>
                <li>Create key, assign capabilities and scopes, then copy one-time secret.</li>
                <li>Use secret as <code>Authorization: Bearer lyr_wk_...</code>.</li>
                <li>Rotate/revoke is also done in the same UI page.</li>
              </ul>
              <CodeBlock
                lang="bash"
                code={`# .env
LAYERUM_API_KEY=lyr_wk_xxxxxxxxxxxxxxxxx`}
              />
            </section>

            <section id="api-keys-limits" className="dr-section">
              <h2>Capabilities, Scopes, and Limits</h2>
              <ul>
                <li>
                  Capabilities: <code>query:read</code>, <code>data:ingest</code>, <code>config:manage</code>.
                </li>
                <li>
                  Scopes: <code>allowed_entity_ids</code>, <code>allowed_model_config_ids</code>.
                </li>
                <li>
                  Limits: <code>rpm_limit</code>, <code>daily_token_limit</code>, optional{' '}
                  <code>expires_at</code>.
                </li>
                <li>Rotate keeps same key record but issues a new secret.</li>
                <li>Revoke disables key immediately.</li>
              </ul>
            </section>

            <section id="sdk" className="dr-section">
              <h2>SDK Overview</h2>
              <p>
                Official package <code>@layerum-team/rag-sdk</code> is a typed client for public API{' '}
                <code>/v1/*</code>.
              </p>
              <p>
                npm:{' '}
                <a className="dr-npm-link" href="https://www.npmjs.com/package/@layerum-team/rag-sdk">
                  https://www.npmjs.com/package/@layerum-team/rag-sdk
                </a>
              </p>
              <CodeBlock lang="bash" code={`npm i @layerum-team/rag-sdk`} />
              <p>
                SDK namespaces: <code>entities</code>, <code>entityTypes</code>, <code>documents</code>,{' '}
                <code>ingestion</code>, <code>query</code>, <code>models</code>.
              </p>
            </section>

            <section id="sdk-client" className="dr-section">
              <h2>SDK Client Options</h2>
              <CodeBlock
                lang="ts"
                code={`import { LayerumClient } from '@layerum-team/rag-sdk';

const client = new LayerumClient({
  apiKey: process.env.LAYERUM_API_KEY!,
  baseUrl: '${env.apiBaseUrl}',
  timeoutMs: 30000,
  maxRetries: 2
});`}
              />
              <ul>
                <li>
                  <code>apiKey</code> required (<code>lyr_wk_...</code>).
                </li>
                <li>
                  <code>baseUrl</code> required, URL of your Layerum API.
                </li>
                <li>
                  <code>timeoutMs</code> default <code>30000</code>.
                </li>
                <li>
                  <code>maxRetries</code> default <code>2</code> (GET on 429/5xx only).
                </li>
              </ul>
            </section>

            <section id="sdk-errors" className="dr-section">
              <h2>SDK Error Handling</h2>
              <p>SDK throws <code>LayerumApiError</code> for API failures.</p>
              <CodeBlock
                lang="ts"
                code={`import { LayerumApiError } from '@layerum-team/rag-sdk';

try {
  await client.query.run({
    entityId: '<entity_uuid>',
    modelConfigId: '<model_config_uuid>',
    query: 'Hello'
  });
} catch (e) {
  if (e instanceof LayerumApiError) {
    console.error(e.status, e.message, e.path, e.method, e.details);
  }
}`}
              />
            </section>

            <section id="sdk-entities" className="dr-section">
              <h2>SDK: entities</h2>
              <ul>
                <li>
                  <code>list(parentId?: UUID)</code> -&gt; <code>GET /v1/entities</code>; optional client-side filter
                  by parent.
                </li>
                <li>
                  <code>tree()</code> -&gt; <code>GET /v1/entities/tree</code>.
                </li>
                <li>
                  <code>create(input)</code> -&gt; <code>POST /v1/entities</code>.
                </li>
                <li>
                  <code>remove(entityId)</code> -&gt; <code>DELETE /v1/entities/:id</code>.
                </li>
              </ul>
              <CodeBlock
                lang="ts"
                code={`await client.entities.create({
  entityTypeId: '<entity_type_uuid>',
  name: 'Invoices',
  description: 'Accounting docs',
  parentId: '<optional_parent_uuid>',
  metadata: { team: 'finance' }
});`}
              />
            </section>

            <section id="sdk-entity-types" className="dr-section">
              <h2>SDK: entityTypes</h2>
              <ul>
                <li>
                  <code>list()</code> -&gt; <code>GET /v1/entity-types</code>.
                </li>
                <li>
                  <code>get(entityTypeId)</code> -&gt; <code>GET /v1/entity-types/:id</code>.
                </li>
                <li>
                  <code>create(input)</code> -&gt; <code>POST /v1/entity-types</code>.
                </li>
                <li>
                  <code>remove(entityTypeId)</code> -&gt; <code>DELETE /v1/entity-types/:id</code>.
                </li>
              </ul>
              <CodeBlock
                lang="ts"
                code={`await client.entityTypes.create({
  name: 'project',
  label: 'Project'
});`}
              />
            </section>

            <section id="sdk-documents" className="dr-section">
              <h2>SDK: documents</h2>
              <ul>
                <li>
                  <code>list({`{ entityId, allInWorkspace? }`})</code> -&gt;{' '}
                  <code>GET /v1/entities/:entityId/documents</code> or <code>GET /v1/documents</code>.
                </li>
                <li>
                  <code>get(entityId, sourceId)</code> -&gt; <code>GET /v1/entities/:entityId/documents/:id</code>.
                </li>
                <li>
                  <code>createText(input)</code> -&gt; <code>POST /v1/entities/:entityId/documents</code> with{' '}
                  <code>{`source_type: "text"`}</code>.
                </li>
                <li>
                  <code>createUrl(input)</code> -&gt; <code>POST /v1/entities/:entityId/documents</code> with{' '}
                  <code>{`source_type: "url"`}</code>.
                </li>
                <li>
                  <code>upload(input)</code> -&gt; <code>POST /v1/entities/:entityId/documents/upload</code>{' '}
                  multipart.
                </li>
                <li>
                  <code>uploadInit(input)</code> -&gt;{' '}
                  <code>POST /v1/entities/:entityId/documents/upload/init</code>.
                </li>
                <li>
                  <code>uploadComplete(input)</code> -&gt;{' '}
                  <code>POST /v1/entities/:entityId/documents/upload/complete</code>.
                </li>
                <li>
                  <code>uploadDirect(input)</code> -&gt; init + S3 POST + complete.
                </li>
                <li>
                  <code>remove({`{ entityId, sourceId }`})</code> -&gt;{' '}
                  <code>DELETE /v1/entities/:entityId/documents/:id</code>.
                </li>
              </ul>
              <CodeBlock
                lang="ts"
                code={`const source = await client.documents.uploadDirect({
  entityId: '<entity_uuid>',
  file: fileBlob,
  fileName: 'large.pdf',
  contentType: 'application/pdf'
});

await client.ingestion.waitUntilReady({
  entityId: '<entity_uuid>',
  sourceId: source.id
});`}
              />
              <p>
                Important: <code>uploadInit.fileSizeBytes</code> must match uploaded object size exactly.
              </p>
            </section>

            <section id="sdk-ingestion" className="dr-section">
              <h2>SDK: ingestion</h2>
              <ul>
                <li>
                  <code>retry({`{ entityId, sourceId }`})</code> -&gt;{' '}
                  <code>POST /v1/entities/:entityId/documents/:id/retry</code>.
                </li>
                <li>
                  <code>error({`{ entityId, sourceId }`})</code> -&gt;{' '}
                  <code>GET /v1/entities/:entityId/documents/:id/error</code>.
                </li>
                <li>
                  <code>waitUntilReady({`{ entityId, sourceId, timeoutMs?, intervalMs? }`})</code> -&gt; polls
                  document status until completed or failed.
                </li>
              </ul>
              <p>
                Defaults: <code>timeoutMs = 120000</code>, <code>intervalMs = 2000</code>.
              </p>
            </section>

            <section id="sdk-query" className="dr-section">
              <h2>SDK: query</h2>
              <ul>
                <li>
                  <code>run(input)</code> -&gt; <code>POST /v1/query</code>.
                </li>
                <li>
                  <code>runDebug(input)</code> -&gt; <code>POST /v1/query/debug</code>.
                </li>
              </ul>
              <CodeBlock
                lang="ts"
                code={`const result = await client.query.run({
  entityId: '<entity_uuid>',
  modelConfigId: '<model_config_uuid>',
  query: 'Summarize key points',
  topK: 8,
  includeParentScopes: true
});

console.log(result.answer);
console.log(result.citations);`}
              />
            </section>

            <section id="sdk-models" className="dr-section">
              <h2>SDK: models</h2>
              <ul>
                <li>
                  <code>listConfigs()</code> -&gt; <code>GET /v1/models</code>.
                </li>
                <li>
                  <code>getConfig(id)</code> -&gt; <code>GET /v1/models/:id</code>.
                </li>
                <li>
                  <code>createConfig(input)</code> -&gt; <code>POST /v1/models</code>.
                </li>
                <li>
                  <code>updateConfig(id, input)</code> -&gt; <code>PATCH /v1/models/:id</code>.
                </li>
                <li>
                  <code>removeConfig(id)</code> -&gt; <code>DELETE /v1/models/:id</code>.
                </li>
                <li>
                  <code>listDefinitions({`{ type? }`})</code> -&gt; <code>GET /v1/model-definitions?type=...</code>.
                </li>
              </ul>
              <CodeBlock
                lang="ts"
                code={`const configs = await client.models.listConfigs();
const created = await client.models.createConfig({
  name: 'SDK Config',
  llmModelId: '<llm_model_uuid>',
  embeddingModelId: '<embedding_model_uuid>',
});
const embeddings = await client.models.listDefinitions({ type: 'embedding' });`}
              />
            </section>

            <section id="sdk-providers" className="dr-section">
              <h2>SDK: providers</h2>
              <ul>
                <li>
                  <code>list()</code> -&gt; <code>GET /v1/providers</code>.
                </li>
                <li>
                  <code>get(id)</code> -&gt; <code>GET /v1/providers/:id</code>.
                </li>
                <li>
                  <code>create(input)</code> -&gt; <code>POST /v1/providers</code>.
                </li>
                <li>
                  <code>test(id)</code> -&gt; <code>POST /v1/providers/:id/test</code>.
                </li>
                <li>
                  <code>remove(id)</code> -&gt; <code>DELETE /v1/providers/:id</code>.
                </li>
              </ul>
            </section>

            <section id="api-public" className="dr-section">
              <h2>Public API (/v1)</h2>
              <p>Authentication for all <code>/v1</code> endpoints:</p>
              <CodeBlock lang="http" code={`Authorization: Bearer lyr_wk_xxxxxxxxxxxxxxxxx`} />
              <ul>
                <li>Key must be active, not revoked, and not expired.</li>
                <li>
                  Capability checks are enforced (<code>query:read</code>, <code>data:ingest</code>, <code>config:manage</code>).
                </li>
                <li>Entity/model scopes and limits are enforced.</li>
              </ul>
            </section>

            <section id="api-error" className="dr-section">
              <h2>API Error Format</h2>
              <CodeBlock
                lang="json"
                code={`{
  "statusCode": 400,
  "message": "Validation failed",
  "timestamp": "2026-03-24T12:00:00.000Z",
  "path": "/v1/query",
  "method": "POST",
  "details": {}
}`}
              />
            </section>

            <section id="api-public-entities" className="dr-section">
              <h2>Public API: Entities</h2>
              <EndpointGroup endpoints={PUBLIC_ENTITIES} />
            </section>

            <section id="api-public-entity-types" className="dr-section">
              <h2>Public API: Entity Types</h2>
              <EndpointGroup endpoints={PUBLIC_ENTITY_TYPES} />
            </section>

            <section id="api-public-documents" className="dr-section">
              <h2>Public API: Documents</h2>
              <EndpointGroup endpoints={PUBLIC_DOCUMENTS} />
            </section>

            <section id="api-public-models" className="dr-section">
              <h2>Public API: Models</h2>
              <EndpointGroup endpoints={PUBLIC_MODELS} />
            </section>

            <section id="api-public-providers" className="dr-section">
              <h2>Public API: Providers</h2>
              <EndpointGroup endpoints={PUBLIC_PROVIDERS} />
            </section>

            <section id="api-public-query" className="dr-section">
              <h2>Public API: Query</h2>
              <EndpointGroup endpoints={PUBLIC_QUERY} />
              <CodeBlock
                lang="json"
                code={`{
  "entityId": "<entity_uuid>",
  "modelConfigId": "<model_config_uuid>",
  "query": "Summarize latest updates",
  "topK": 8,
  "includeParentScopes": true
}`}
              />
            </section>

            <section id="capacity" className="dr-section">
              <h2>Capacity and Upload Model</h2>
              <p>Capacity is account-level and can be distributed dynamically across workspaces.</p>
              <ul>
                <li>
                  Counted usage: entities, documents/data source bytes, chunks, S3 files tied to documents,
                  pending upload reservations.
                </li>
                <li>
                  Not counted: audit records, access records, API key metadata, model/provider metadata.
                </li>
                <li>
                  Direct upload hardening: capacity reserved at <code>upload/init</code>, object validated at{' '}
                  <code>upload/complete</code>, stale sessions are cleaned up.
                </li>
              </ul>
              <CodeBlock
                lang="bash"
                code={`curl -X POST "${env.apiBaseUrl}/v1/entities/<entityId>/documents/upload/init" \\
  -H "Authorization: Bearer lyr_wk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "file_name":"manual.pdf",
    "file_size_bytes":123456,
    "content_type":"application/pdf"
  }'`}
              />
            </section>

            <section id="cli" className="dr-section">
              <h2>{tDocsReference("cli.overview.title")}</h2>
              <p>{rich("cli.overview.paragraph")}</p>
              <p>{tDocsReference("cli.overview.requirement")}</p>
              <CodeBlock lang="bash" code={CLI_INSTALL_CODE} />
            </section>

            <section id="cli-auth" className="dr-section">
              <h2>{tDocsReference("cli.auth.title")}</h2>
              <ul>
                <li>{rich("cli.auth.browser")}</li>
                <li>{rich("cli.auth.code")}</li>
                <li>{rich("cli.auth.autoWorkspace")}</li>
                <li>{rich("cli.auth.credentials")}</li>
                <li>{rich("cli.auth.lifetime")}</li>
                <li>{rich("cli.auth.logout")}</li>
              </ul>
              <p>{tDocsReference("cli.auth.permissions")}</p>
              <p>{tDocsReference("cli.auth.canTitle")}</p>
              <ul>
                <li>{tDocsReference("cli.auth.can1")}</li>
                <li>{tDocsReference("cli.auth.can2")}</li>
                <li>{tDocsReference("cli.auth.can3")}</li>
                <li>{tDocsReference("cli.auth.can4")}</li>
                <li>{tDocsReference("cli.auth.can5")}</li>
              </ul>
              <p>{tDocsReference("cli.auth.cannotTitle")}</p>
              <ul>
                <li>{tDocsReference("cli.auth.cannot1")}</li>
                <li>{tDocsReference("cli.auth.cannot2")}</li>
                <li>{tDocsReference("cli.auth.cannot3")}</li>
              </ul>
              <CodeBlock lang="bash" code={CLI_LOGIN_CODE} />
            </section>

            <section id="cli-workspace" className="dr-section">
              <h2>{tDocsReference("cli.workspace.title")}</h2>
              <p>{tDocsReference("cli.workspace.intro")}</p>
              <ol>
                <li>{rich("cli.workspace.flag")}</li>
                <li>{rich("cli.workspace.env")}</li>
                <li>{rich("cli.workspace.saved")}</li>
              </ol>
              <p>{rich("cli.workspace.mcp")}</p>
            </section>

            <section id="cli-commands" className="dr-section">
              <h2>{tDocsReference("cli.commands.title")}</h2>
              <p>{rich("cli.commands.global")}</p>
              <div className="dr-table-wrap">
                <table className="dr-table">
                  <thead>
                    <tr>
                      <th>{tDocsReference("cli.commands.colCommand")}</th>
                      <th>{tDocsReference("cli.commands.colDescription")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CLI_COMMANDS.map((row) => (
                      <tr key={row.key}>
                        <td>
                          <code>{row.command}</code>
                        </td>
                        <td>{rich(`cli.commands.${row.key}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="mcp-setup" className="dr-section">
              <h2>{tDocsReference("cli.mcp.title")}</h2>
              <p>{rich("cli.mcp.intro")}</p>
              <CodeBlock lang="Claude Code" code={CLAUDE_CODE_CODE} />
              <p>{rich("cli.mcp.others")}</p>
              <CodeBlock lang="json" code={MCP_CONFIG_CODE} />
              <p>{rich("cli.mcp.login")}</p>
            </section>

            <section id="mcp-tools" className="dr-section">
              <h2>{tDocsReference("cli.tools.title")}</h2>
              <p>{rich("cli.tools.note")}</p>
              <div className="dr-table-wrap">
                <table className="dr-table">
                  <thead>
                    <tr>
                      <th>{tDocsReference("cli.tools.colTool")}</th>
                      <th>{tDocsReference("cli.tools.colInputs")}</th>
                      <th>{tDocsReference("cli.tools.colDescription")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MCP_TOOLS.map((row) => (
                      <tr key={row.key}>
                        <td>
                          <code>{row.name}</code>
                        </td>
                        <td>{row.inputs ? <code>{row.inputs}</code> : null}</td>
                        <td>{rich(`cli.tools.${row.key}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="cli-env" className="dr-section">
              <h2>{tDocsReference("cli.env.title")}</h2>
              <div className="dr-table-wrap">
                <table className="dr-table">
                  <thead>
                    <tr>
                      <th>{tDocsReference("cli.env.colVariable")}</th>
                      <th>{tDocsReference("cli.env.colDescription")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CLI_ENV.map((row) => (
                      <tr key={row.key}>
                        <td>
                          <code>{row.name}</code>
                        </td>
                        <td>{rich(`cli.env.${row.key}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="cli-troubleshooting" className="dr-section">
              <h2>{tDocsReference("cli.troubleshooting.title")}</h2>
              <ul>
                <li>{rich("cli.troubleshooting.notLoggedIn")}</li>
                <li>{rich("cli.troubleshooting.noBrowser")}</li>
                <li>{rich("cli.troubleshooting.noWorkspace")}</li>
                <li>{rich("cli.troubleshooting.malformed")}</li>
              </ul>
            </section>
          </article>
        </section>
        </Reveal>
    </main>
  );
}
