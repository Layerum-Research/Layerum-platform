import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth";
import { registerDataCommands } from "./commands/data";
import { registerDocumentCommands } from "./commands/documents";
import { registerMcpCommand } from "./commands/mcp";
import { registerQueryCommand } from "./commands/query";
import { registerWorkspaceCommands } from "./commands/workspaces";
import { VERSION } from "./version";

const program = new Command()
  .name("layerum")
  .description("Layerum command line tool")
  .version(VERSION)
  .option("--json", "print raw JSON")
  .option("--workspace <id>", "workspace to use for this command");

registerAuthCommands(program);
registerWorkspaceCommands(program);
registerDataCommands(program);
registerDocumentCommands(program);
registerQueryCommand(program);
registerMcpCommand(program);

await program.parseAsync();
