import { env } from './env';
import { SITE_URL } from './site';

export const CLI_SERVER_ENV_CODE = `export LAYERUM_APP_URL=${SITE_URL}
export LAYERUM_API_URL=${env.apiBaseUrl}`;

export const CLI_LOGIN_CODE = `${CLI_SERVER_ENV_CODE}
layerum login
layerum login --code`;

export const CLAUDE_CODE_CODE = `claude mcp add layerum \\
  -e LAYERUM_APP_URL=${SITE_URL} \\
  -e LAYERUM_API_URL=${env.apiBaseUrl} \\
  -- npx -y @layerum-team/cli mcp`;

export const MCP_CONFIG_CODE = `{
  "mcpServers": {
    "layerum": {
      "command": "npx",
      "args": ["-y", "@layerum-team/cli", "mcp"],
      "env": {
        "LAYERUM_APP_URL": "${SITE_URL}",
        "LAYERUM_API_URL": "${env.apiBaseUrl}"
      }
    }
  }
}`;
