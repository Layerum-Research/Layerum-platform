import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getMe } from "../api/auth";
import {
  addTextDocument,
  addUrlDocument,
  getDocument,
  getDocumentError,
  listDocuments,
} from "../api/documents";
import { flattenEntityTree, getEntityTree } from "../api/entities";
import { listModelConfigs, resolveModelConfigId } from "../api/models";
import { runQuery } from "../api/query";
import { listWorkspaces, useWorkspace } from "../api/workspaces";
import { openBrowser } from "../auth/browser";
import { currentSession, startLogin } from "../auth/login";
import { beginPendingLogin, finishPendingLogin } from "../auth/pending-login";
import { resolveWorkspaceId } from "../config";
import { CliError, NotLoggedInError } from "../errors";
import { VERSION } from "../version";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const workspaceId = z
  .string()
  .optional()
  .describe("Workspace id. Defaults to the workspace chosen with use_workspace.");

function text(value: unknown): ToolResult {
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text: body }] };
}

function failure(error: unknown): ToolResult {
  let message: string;
  if (error instanceof NotLoggedInError) message = "Not logged in. Call the `login` tool first.";
  else if (error instanceof CliError) message = error.message;
  else message = `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
  return { content: [{ type: "text", text: message }], isError: true };
}

async function tool(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return text(await fn());
  } catch (error) {
    return failure(error);
  }
}

async function workspaceFor(explicit?: string) {
  const id = await resolveWorkspaceId(explicit);
  if (!id) {
    throw new CliError(
      "No workspace selected. Call `list_workspaces`, then `use_workspace`, or pass workspace_id.",
    );
  }
  return id;
}

function loggedInText(result: { user: { email: string }; workspace: { name: string } | null }) {
  const workspace = result.workspace
    ? ` Workspace "${result.workspace.name}" is selected.`
    : " No workspace is selected yet; call list_workspaces and use_workspace.";
  return `Logged in as ${result.user.email}.${workspace}`;
}

export function createServer() {
  const server = new McpServer({ name: "layerum", version: VERSION });

  server.registerTool(
    "login",
    {
      description:
        'Log in to Layerum. method "browser" (default) opens the login page and returns once the user finished; if the browser cannot be opened, it returns a URL for the user to open. Use method "code" when the browser flow fails or times out, or when this tool runs on a different machine than the user\'s browser: it returns a URL, the user authorizes there and gets a code, and you then call complete_login with that code. Call this when other tools report that the user is not logged in.',
      inputSchema: {
        force: z.boolean().optional().describe("Log in again even if already logged in."),
        method: z
          .enum(["browser", "code"])
          .optional()
          .describe('"browser" (default) or "code" for a manual login finished with complete_login.'),
      },
    },
    async ({ force, method }) => {
      try {
        if (!force) {
          const me = await currentSession();
          if (me) return text(`Already logged in as ${me.email}.`);
        }
        if (method === "code") {
          const url = beginPendingLogin();
          await openBrowser(url);
          return text(
            `Ask the user to open this URL (a browser may have opened already), click Authorize, and copy the code shown on the page. Then call complete_login with that code within 10 minutes:\n${url}`,
          );
        }
        const flow = await startLogin();
        const opened = await openBrowser(flow.url);
        if (!opened) {
          flow.completion.catch((error) => console.error(`Login failed: ${error.message}`));
          return text(
            `Could not open a browser. Ask the user to open this URL and finish logging in, then call whoami to confirm:\n${flow.url}`,
          );
        }
        const result = await flow.completion;
        return text(loggedInText(result));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "complete_login",
    {
      description:
        'Finish a login started with `login` using method "code". Pass the code the user copied from the browser page.',
      inputSchema: { code: z.string().describe("The code shown in the browser after authorizing.") },
    },
    ({ code }) => tool(async () => loggedInText(await finishPendingLogin(code))),
  );

  server.registerTool(
    "whoami",
    { description: "Show the logged-in Layerum user and the currently selected workspace id." },
    () =>
      tool(async () => {
        const me = await getMe();
        return {
          id: me.id,
          email: me.email,
          full_name: me.full_name,
          workspace_id: await resolveWorkspaceId(),
        };
      }),
  );

  server.registerTool(
    "list_workspaces",
    { description: "List the workspaces the user belongs to, with id, name, slug and role." },
    () =>
      tool(async () =>
        (await listWorkspaces()).map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          slug: m.workspace.slug,
          role: m.role,
        })),
      ),
  );

  server.registerTool(
    "use_workspace",
    {
      description:
        "Select the default workspace for later tool calls. Accepts a workspace id, or an exact name or slug.",
      inputSchema: { workspace: z.string().describe("Workspace id, exact name or slug.") },
    },
    ({ workspace }) =>
      tool(async () => {
        const selected = await useWorkspace(workspace);
        return `Using workspace "${selected.name}" (${selected.id}).`;
      }),
  );

  server.registerTool(
    "list_entities",
    {
      description:
        "List all entities of a workspace as a flat list with id, name, type, parent_id and depth. Entity ids are needed to add documents and to query.",
      inputSchema: { workspace_id: workspaceId },
    },
    ({ workspace_id }) =>
      tool(async () =>
        flattenEntityTree(await getEntityTree(await workspaceFor(workspace_id))).map((e) => ({
          id: e.id,
          name: e.name,
          type: e.entity_type?.label ?? null,
          parent_id: e.parent_id,
          depth: e.depth,
        })),
      ),
  );

  server.registerTool(
    "list_models",
    {
      description:
        "List the model configs of a workspace. The default one is used by `query` when no model_config_id is given.",
      inputSchema: { workspace_id: workspaceId },
    },
    ({ workspace_id }) =>
      tool(async () =>
        (await listModelConfigs(await workspaceFor(workspace_id))).map((c) => ({
          id: c.id,
          name: c.name,
          llm: c.llm ? `${c.llm.provider}/${c.llm.display_name}` : null,
          embedding: c.embedding ? `${c.embedding.provider}/${c.embedding.display_name}` : null,
          is_default: c.is_default,
        })),
      ),
  );

  server.registerTool(
    "list_documents",
    {
      description:
        "List documents with id, name, type, status and entity. Status is pending, processing, completed or failed; only completed documents can be queried.",
      inputSchema: {
        workspace_id: workspaceId,
        entity_id: z.string().optional().describe("Only documents of this entity. Default: all."),
      },
    },
    ({ workspace_id, entity_id }) =>
      tool(async () =>
        (await listDocuments(await workspaceFor(workspace_id), entity_id)).map((s) => ({
          id: s.id,
          name: s.display_name,
          type: s.source_type,
          status: s.status,
          entity_id: s.entity_id,
          entity_name: s.entity?.name ?? null,
          created_at: s.created_at,
        })),
      ),
  );

  server.registerTool(
    "get_document",
    {
      description:
        "Get one document's details and ingestion status. Includes the error message when ingestion failed.",
      inputSchema: {
        workspace_id: workspaceId,
        entity_id: z.string().describe("Entity the document belongs to."),
        document_id: z.string().describe("Document id."),
      },
    },
    ({ workspace_id, entity_id, document_id }) =>
      tool(async () => {
        const id = await workspaceFor(workspace_id);
        const source = await getDocument(id, entity_id, document_id);
        const error =
          source.status === "failed"
            ? (await getDocumentError(id, entity_id, document_id)).latestJob.error_message
            : null;
        return {
          id: source.id,
          name: source.display_name,
          type: source.source_type,
          status: source.status,
          entity_id: source.entity_id,
          mime_type: source.mime_type,
          file_size: source.file_size,
          created_at: source.created_at,
          updated_at: source.updated_at,
          error,
        };
      }),
  );

  server.registerTool(
    "add_text_document",
    {
      description:
        "Add a text document to an entity. Ingestion runs in the background; check progress with get_document.",
      inputSchema: {
        workspace_id: workspaceId,
        entity_id: z.string().describe("Entity to add the document to."),
        name: z.string().min(1).describe("Display name."),
        text: z.string().min(1).describe("Document content."),
      },
    },
    ({ workspace_id, entity_id, name, text: content }) =>
      tool(async () => {
        const source = await addTextDocument(await workspaceFor(workspace_id), entity_id, name, content);
        return { id: source.id, name: source.display_name, status: source.status };
      }),
  );

  server.registerTool(
    "add_url_document",
    {
      description:
        "Add a web page to an entity by URL. Ingestion runs in the background; check progress with get_document.",
      inputSchema: {
        workspace_id: workspaceId,
        entity_id: z.string().describe("Entity to add the document to."),
        url: z.string().url().describe("http or https URL."),
        name: z.string().optional().describe("Display name. Defaults to the URL."),
      },
    },
    ({ workspace_id, entity_id, url, name }) =>
      tool(async () => {
        const source = await addUrlDocument(await workspaceFor(workspace_id), entity_id, name ?? url, url);
        return { id: source.id, name: source.display_name, status: source.status };
      }),
  );

  server.registerTool(
    "query",
    {
      description:
        "Ask a question against the documents of an entity (including its parents' scope). Returns the answer and numbered citations.",
      inputSchema: {
        workspace_id: workspaceId,
        entity_id: z.string().describe("Entity to query."),
        question: z.string().min(1).describe("The question."),
        model_config_id: z
          .string()
          .optional()
          .describe("Model config id from list_models. Defaults to the workspace default."),
        top_k: z.number().int().min(1).max(20).optional().describe("Chunks to retrieve."),
      },
    },
    ({ workspace_id, entity_id, question, model_config_id, top_k }) =>
      tool(async () => {
        const id = await workspaceFor(workspace_id);
        const result = await runQuery({
          workspaceId: id,
          entityId: entity_id,
          modelConfigId: await resolveModelConfigId(id, model_config_id),
          query: question,
          topK: top_k,
        });
        return {
          answer: result.answer,
          citations: result.citations.map((c) => ({
            index: c.index,
            document_id: c.document_id,
            document_title: c.document_title,
            excerpt: c.excerpt,
          })),
        };
      }),
  );

  return server;
}

export async function runMcpServer() {
  await createServer().connect(new StdioServerTransport());
}
