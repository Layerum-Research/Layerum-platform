# Layerum CLI and MCP Documentation (`@layerum-team/cli`)

## 1. Overview

`@layerum-team/cli` is a command line tool and an MCP (Model Context Protocol) server for Layerum.

It signs in with the user's own Layerum account through OAuth and acts as that user. Use it for people and AI assistants. For server integrations use the SDK (`@layerum-team/rag-sdk`) or the public API (`/v1/*`) with a workspace API key (`lyr_wk_*`).

---

## 2. Install

```bash
npm i -g @layerum-team/cli
```

Requires Node 20 or newer.

---

## 3. Authentication

Set the URLs of your Layerum server first:

```bash
export LAYERUM_APP_URL=https://layerum.example.com
export LAYERUM_API_URL=https://api.layerum.example.com
```

Browser flow:

```bash
layerum login
```

Opens the browser, the user authorizes, and the CLI receives the token on a local redirect (waits up to 5 minutes).

Code flow, for SSH, containers or any machine where the local redirect cannot work:

```bash
layerum login --code
```

Prints a URL. Open it on any device, authorize, and paste the code the page shows (valid 5 minutes). Needs an interactive terminal.

- If the user belongs to one workspace it is selected automatically after login; otherwise run `layerum use <workspace>`.
- Credentials: `~/.config/layerum/credentials.json` (`$XDG_CONFIG_HOME/layerum` if set, `%APPDATA%\layerum` on Windows). On macOS and Linux the directory is created with mode 700 and the files with mode 600. The selected workspace is saved in `config.json` in the same directory.
- The token is valid for 90 days. After that run `layerum login` again.
- `layerum logout` revokes the token on the server and deletes local credentials and the saved workspace. If the server-side revoke fails, the CLI reports it and the token may stay valid until it expires.
- Access can also be revoked in the Layerum app under Account, Connected apps.

Token permissions (it acts as the user, so it is limited by the user's role in each workspace):

- Can: view the profile and workspaces; read entities, documents and models (including model configurations); add documents and create entities; delete documents the user can manage; run queries.
- Cannot: manage the account (password, two-factor); manage workspace settings (members, roles, API keys, providers); delete workspaces.

---

## 4. Workspace selection

Order of precedence:

1. `--workspace <id>` option
2. `LAYERUM_WORKSPACE` environment variable
3. Workspace saved with `layerum use <workspace>` (id, name or slug)

MCP tools use the optional `workspace_id` argument in place of the option, then the same environment variable and saved workspace.

---

## 5. Commands

Global options: `--json` prints raw JSON; `--workspace <id>` overrides the default workspace for one command.

| Command | Description |
|---|---|
| `layerum login [--force] [--code]` | Log in. `--force` logs in again even if already logged in. `--code` uses the paste-a-code flow. |
| `layerum logout` | Revoke the token and delete local credentials. |
| `layerum whoami` | Show the logged-in user. |
| `layerum workspaces` | List workspaces. The current one is marked with `*`. |
| `layerum use <workspace>` | Set the default workspace by id, name or slug. |
| `layerum entities [--flat]` | List entities as a tree, or as a flat table with `--flat`. |
| `layerum models` | List model configs. |
| `layerum documents list [--entity <id>]` | List documents in the workspace, or in one entity. |
| `layerum documents add --entity <id> (--text <s> \| --url <u> \| --file <path>) [--name <n>] [--wait]` | Add a document. Pass exactly one of `--text`, `--url`, `--file`. `--name` sets the display name. `--wait` waits until ingestion finishes (up to 5 minutes). |
| `layerum documents get <id> --entity <id>` | Show a document and its ingestion status. |
| `layerum documents delete <id> --entity <id> --yes` | Delete a document permanently. `--yes` is required. |
| `layerum query "<question>" --entity <id> [--model <id>] [--top-k <n>]` | Ask a question against an entity. `--model` picks a model config (default: the workspace default). `--top-k` is 1 to 20. Prints the answer and numbered sources. |
| `layerum mcp` | Start the MCP server on stdio. |

---

## 6. MCP setup

Claude Code:

```bash
claude mcp add layerum \
  -e LAYERUM_APP_URL=https://layerum.example.com \
  -e LAYERUM_API_URL=https://api.layerum.example.com \
  -- npx -y @layerum-team/cli mcp
```

Other MCP clients (works with clients that accept the `mcpServers` format, such as Cursor and Claude Desktop):

```json
{
  "mcpServers": {
    "layerum": {
      "command": "npx",
      "args": ["-y", "@layerum-team/cli", "mcp"],
      "env": {
        "LAYERUM_APP_URL": "https://layerum.example.com",
        "LAYERUM_API_URL": "https://api.layerum.example.com"
      }
    }
  }
}
```

When the assistant is not logged in it calls the `login` tool. With the default method `browser` the tool opens the login page and returns when the user finishes. With method `code` it returns a URL; the user authorizes there and gives the code to the assistant, which calls `complete_login` within 10 minutes. Use `code` when the browser flow fails or the server runs on another machine than the user's browser.

---

## 7. MCP tools

Inputs ending with `?` are optional. Tools that work with workspace data accept an optional `workspace_id`. MCP has no delete tools: documents can be deleted only with the CLI.

| Tool | Inputs | Description |
|---|---|---|
| `login` | `force?`, `method?` | Log in. `method` is `browser` (default) or `code`, finished with `complete_login`. `force` logs in again. |
| `complete_login` | `code` | Finish a login started with method `code`. |
| `whoami` | none | Show the logged-in user and the selected workspace id. |
| `list_workspaces` | none | List workspaces with id, name, slug and role. |
| `use_workspace` | `workspace` | Select the default workspace by id, exact name or slug. |
| `list_entities` | `workspace_id?` | List all entities as a flat list with id, name, type, parent_id and depth. |
| `list_models` | `workspace_id?` | List model configs. The default one is used by `query` when no `model_config_id` is given. |
| `list_documents` | `workspace_id?`, `entity_id?` | List documents with id, name, type, status and entity. Status is pending, processing, completed or failed; only completed documents can be queried. |
| `get_document` | `workspace_id?`, `entity_id`, `document_id` | Get document details and ingestion status, including the error message when ingestion failed. |
| `add_text_document` | `workspace_id?`, `entity_id`, `name`, `text` | Add a text document to an entity. Ingestion runs in the background. |
| `add_url_document` | `workspace_id?`, `entity_id`, `url`, `name?` | Add a web page (http or https) to an entity. `name` defaults to the URL. Ingestion runs in the background. |
| `query` | `workspace_id?`, `entity_id`, `question`, `model_config_id?`, `top_k?` | Ask a question against an entity, including its parents' scope. Returns the answer and numbered citations. `top_k` is 1 to 20. |

---

## 8. Environment variables

| Variable | Description |
|---|---|
| `LAYERUM_APP_URL` | URL of the Layerum web app. Required for login. |
| `LAYERUM_API_URL` | URL of the Layerum API. Required for login; saved with the credentials. |
| `LAYERUM_WORKSPACE` | Workspace to use. Overrides the workspace chosen with `layerum use`; `--workspace` overrides this. |
| `XDG_CONFIG_HOME` | Base directory for credentials and config on macOS and Linux. Default `~/.config`. |
| `APPDATA` | Base directory for credentials and config on Windows. |

---

## 9. Troubleshooting

- Not logged in, or a request returns 401: run `layerum login`. The token may have expired or been revoked. In an MCP client the assistant should call the `login` tool.
- Browser does not open, or the machine is remote: run `layerum login --code` and open the printed URL on any device.
- No workspace selected: run `layerum workspaces`, then `layerum use <workspace>`. Or set `LAYERUM_WORKSPACE`, or pass `--workspace`.
- Credentials file reported as malformed: run `layerum login --force`.
