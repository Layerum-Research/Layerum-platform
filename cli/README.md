# @layerum-team/cli

Layerum command line tool and MCP server.

## Install

```
npm i -g @layerum-team/cli
```

Requires Node 20 or newer.

## Server

Point the CLI at your Layerum server before logging in:

```
export LAYERUM_APP_URL=https://layerum.example.com
export LAYERUM_API_URL=https://api.layerum.example.com
```

`LAYERUM_APP_URL` is the web app (the frontend), `LAYERUM_API_URL` is the backend API. With the Docker stack on one machine these are `http://localhost:3000` and `http://localhost:4000`.

## Login

```
layerum login
```

Opens your browser and signs in with OAuth (PKCE, loopback redirect). The token is stored in `~/.config/layerum/credentials.json` (`$XDG_CONFIG_HOME/layerum` if set, `%APPDATA%\layerum` on Windows). If you have one workspace it is selected automatically; otherwise pick one with `layerum use <workspace>`.

On a machine where the browser redirect cannot work (SSH, containers):

```
layerum login --code
```

Open the printed URL on any device, authorize, and paste the code the page shows (valid 5 minutes).

## Commands

| Command | |
|---|---|
| `layerum login [--force] [--code]` | Log in (`--code`: paste a code instead of using the local redirect) |
| `layerum logout` | Revoke the token and delete local credentials |
| `layerum whoami` | Show the logged-in user |
| `layerum workspaces` | List workspaces (current one marked with `*`) |
| `layerum use <workspace>` | Set the default workspace by id, name or slug |
| `layerum entities [--flat]` | List entities as a tree or a flat table |
| `layerum models` | List model configs |
| `layerum documents list [--entity <id>]` | List documents |
| `layerum documents add --entity <id> (--text <s> \| --url <u> \| --file <path>) [--name <n>] [--wait]` | Add a document |
| `layerum documents get <id> --entity <id>` | Show a document |
| `layerum documents delete <id> --entity <id> --yes` | Delete a document |
| `layerum query "<question>" --entity <id> [--model <id>] [--top-k <n>]` | Ask a question |
| `layerum mcp` | Start the MCP server on stdio |

Global options: `--json` prints raw JSON, `--workspace <id>` overrides the default workspace.

## MCP

Claude Code:

```
claude mcp add layerum \
  -e LAYERUM_APP_URL=https://layerum.example.com \
  -e LAYERUM_API_URL=https://api.layerum.example.com \
  -- npx -y @layerum-team/cli mcp
```

Other clients:

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

Tools: `login` (`method: "code"` for a manual login, finished with `complete_login`), `complete_login`, `whoami`, `list_workspaces`, `use_workspace`, `list_entities`, `list_models`, `list_documents`, `get_document`, `add_text_document`, `add_url_document`, `query`.

## Environment

| Variable | |
|---|---|
| `LAYERUM_APP_URL` | Required for login. URL of the Layerum web app |
| `LAYERUM_API_URL` | Required for login. URL of the Layerum API |
| `LAYERUM_WORKSPACE` | Overrides the workspace chosen with `layerum use` |
| `XDG_CONFIG_HOME` | Base directory for credentials and config |

After login the API URL is saved with the credentials, so other commands do not need the variables.

Workspace precedence: `--workspace` flag, then `LAYERUM_WORKSPACE`, then `layerum use`.
