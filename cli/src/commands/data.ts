import type { Command } from "commander";
import { flattenEntityTree, getEntityTree } from "../api/entities";
import { listModelConfigs } from "../api/models";
import type { EntityNode } from "../api/types";
import { printJson, printTable } from "../output";
import { globals, handle, requireWorkspaceId } from "./run";

function treeLines(nodes: EntityNode[], indent = ""): string[] {
  return nodes.flatMap((node) => [
    `${indent}${node.name} [${node.entity_type?.label ?? "?"}]  ${node.id}`,
    ...treeLines(node.children, `${indent}  `),
  ]);
}

export function registerDataCommands(program: Command) {
  program
    .command("entities")
    .description("List entities")
    .option("--flat", "print a flat table instead of a tree")
    .action(
      handle(async (options: { flat?: boolean }, command: Command) => {
        const { json, workspace } = globals(command);
        const tree = await getEntityTree(await requireWorkspaceId(workspace));
        if (options.flat) {
          const entities = flattenEntityTree(tree);
          if (json) printJson(entities);
          else {
            printTable(
              ["ID", "NAME", "TYPE", "PARENT"],
              entities.map((e) => [e.id, e.name, e.entity_type?.label ?? "", e.parent_id ?? ""]),
            );
          }
          return;
        }
        if (json) printJson(tree);
        else if (tree.length === 0) console.log("No entities.");
        else console.log(treeLines(tree).join("\n"));
      }),
    );

  program
    .command("models")
    .description("List model configs")
    .action(
      handle(async (_options: unknown, command: Command) => {
        const { json, workspace } = globals(command);
        const configs = await listModelConfigs(await requireWorkspaceId(workspace));
        if (json) {
          printJson(configs);
          return;
        }
        printTable(
          ["ID", "NAME", "LLM", "EMBEDDING", "DEFAULT"],
          configs.map((c) => [
            c.id,
            c.name,
            c.llm ? `${c.llm.provider}/${c.llm.display_name}` : "",
            c.embedding ? `${c.embedding.provider}/${c.embedding.display_name}` : "",
            c.is_default ? "yes" : "",
          ]),
        );
      }),
    );
}
