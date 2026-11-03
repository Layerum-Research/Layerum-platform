import type { Command } from "commander";
import { listWorkspaces, useWorkspace } from "../api/workspaces";
import { resolveWorkspaceId } from "../config";
import { printJson, printTable } from "../output";
import { globals, handle } from "./run";

export function registerWorkspaceCommands(program: Command) {
  program
    .command("workspaces")
    .description("List your workspaces")
    .action(
      handle(async (_options: unknown, command: Command) => {
        const { json, workspace } = globals(command);
        const memberships = await listWorkspaces();
        if (json) {
          printJson(memberships);
          return;
        }
        const current = await resolveWorkspaceId(workspace);
        printTable(
          ["", "ID", "NAME", "SLUG", "ROLE"],
          memberships.map((m) => [
            m.workspace.id === current ? "*" : "",
            m.workspace.id,
            m.workspace.name,
            m.workspace.slug,
            m.role,
          ]),
        );
      }),
    );

  program
    .command("use <workspace>")
    .description("Set the default workspace (id, name or slug)")
    .action(
      handle(async (query: string, _options: unknown, command: Command) => {
        const workspace = await useWorkspace(query);
        if (globals(command).json) printJson(workspace);
        else console.log(`Using workspace ${workspace.name} (${workspace.id}).`);
      }),
    );
}
