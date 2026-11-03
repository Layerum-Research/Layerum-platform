import type { Command } from "commander";
import { resolveModelConfigId } from "../api/models";
import { runQuery } from "../api/query";
import { CliError } from "../errors";
import { printJson } from "../output";
import { globals, handle, requireWorkspaceId } from "./run";

export function registerQueryCommand(program: Command) {
  program
    .command("query <question>")
    .description("Ask a question against an entity")
    .requiredOption("--entity <id>", "entity to query")
    .option("--model <modelConfigId>", "model config to use (default: the workspace default)")
    .option("--top-k <n>", "number of chunks to retrieve (1-20)")
    .action(
      handle(
        async (
          question: string,
          options: { entity: string; model?: string; topK?: string },
          command: Command,
        ) => {
          const { json, workspace } = globals(command);
          const topK = options.topK === undefined ? undefined : Number(options.topK);
          if (topK !== undefined && (!Number.isInteger(topK) || topK < 1 || topK > 20)) {
            throw new CliError("--top-k must be an integer between 1 and 20.");
          }
          const workspaceId = await requireWorkspaceId(workspace);
          const result = await runQuery({
            workspaceId,
            entityId: options.entity,
            modelConfigId: await resolveModelConfigId(workspaceId, options.model),
            query: question,
            topK,
          });
          if (json) {
            printJson(result);
            return;
          }
          console.log(result.answer);
          if (result.citations.length > 0) {
            console.log("\nSources:");
            for (const c of result.citations) {
              console.log(`[${c.index}] ${c.document_title ?? c.document_id}`);
            }
          }
        },
      ),
    );
}
