import type { Command } from "commander";
import { runMcpServer } from "../mcp/server";
import { handle } from "./run";

export function registerMcpCommand(program: Command) {
  program
    .command("mcp")
    .description("Start the MCP server on stdio")
    .action(handle(runMcpServer));
}
