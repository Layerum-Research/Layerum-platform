import type { Command } from "commander";
import {
  addFileDocument,
  addTextDocument,
  addUrlDocument,
  deleteDocument,
  getDocument,
  getDocumentError,
  listDocuments,
  waitForDocument,
} from "../api/documents";
import type { DataSource } from "../api/types";
import { CliError } from "../errors";
import { printJson, printTable } from "../output";
import { globals, handle, requireWorkspaceId } from "./run";

type AddOptions = {
  entity: string;
  text?: string;
  url?: string;
  file?: string;
  name?: string;
  wait?: boolean;
};

function defaultTextName(text: string) {
  const firstLine = text.trim().split("\n")[0].slice(0, 60);
  return firstLine || "Text";
}

export function registerDocumentCommands(program: Command) {
  const documents = program.command("documents").description("Manage documents");

  documents
    .command("list")
    .description("List documents in the workspace, or in one entity")
    .option("--entity <id>", "only documents of this entity")
    .action(
      handle(async (options: { entity?: string }, command: Command) => {
        const { json, workspace } = globals(command);
        const sources = await listDocuments(await requireWorkspaceId(workspace), options.entity);
        if (json) {
          printJson(sources);
          return;
        }
        printTable(
          ["ID", "NAME", "TYPE", "STATUS", "ENTITY", "CREATED"],
          sources.map((s) => [
            s.id,
            s.display_name,
            s.source_type,
            s.status,
            s.entity?.name ?? s.entity_id,
            s.created_at,
          ]),
        );
      }),
    );

  documents
    .command("add")
    .description("Add a text, URL or file document")
    .requiredOption("--entity <id>", "entity to add the document to")
    .option("--text <string>", "plain text content")
    .option("--url <url>", "web page to ingest")
    .option("--file <path>", "local file to upload")
    .option("--name <displayName>", "display name")
    .option("--wait", "wait until ingestion finishes")
    .action(
      handle(async (options: AddOptions, command: Command) => {
        const { json, workspace } = globals(command);
        const given = [options.text, options.url, options.file].filter((v) => v !== undefined);
        if (given.length !== 1) {
          throw new CliError("Pass exactly one of --text, --url or --file.");
        }
        const workspaceId = await requireWorkspaceId(workspace);

        let source: DataSource;
        if (options.text !== undefined) {
          source = await addTextDocument(
            workspaceId,
            options.entity,
            options.name ?? defaultTextName(options.text),
            options.text,
          );
        } else if (options.url !== undefined) {
          source = await addUrlDocument(workspaceId, options.entity, options.name ?? options.url, options.url);
        } else {
          source = await addFileDocument(workspaceId, options.entity, options.file as string, options.name);
        }

        if (options.wait) source = await waitForDocument(workspaceId, options.entity, source.id);
        if (json) printJson(source);
        else console.log(`${source.id}  ${source.display_name}  ${source.status}`);
      }),
    );

  documents
    .command("get <id>")
    .description("Show a document")
    .requiredOption("--entity <id>", "entity the document belongs to")
    .action(
      handle(async (id: string, options: { entity: string }, command: Command) => {
        const { json, workspace } = globals(command);
        const workspaceId = await requireWorkspaceId(workspace);
        const source = await getDocument(workspaceId, options.entity, id);
        const failure =
          source.status === "failed" ? await getDocumentError(workspaceId, options.entity, id) : null;
        if (json) {
          printJson(failure ? { ...source, error: failure.latestJob } : source);
          return;
        }
        const lines = [
          `id: ${source.id}`,
          `name: ${source.display_name}`,
          `type: ${source.source_type}`,
          `status: ${source.status}`,
          `entity: ${source.entity?.name ?? source.entity_id}`,
          `visibility: ${source.visibility}`,
          `mime type: ${source.mime_type ?? "-"}`,
          `size: ${source.file_size ?? "-"}`,
          `created: ${source.created_at}`,
          `updated: ${source.updated_at}`,
        ];
        if (failure) lines.push(`error: ${failure.latestJob.error_message ?? "no error message recorded"}`);
        console.log(lines.join("\n"));
      }),
    );

  documents
    .command("delete <id>")
    .description("Delete a document")
    .requiredOption("--entity <id>", "entity the document belongs to")
    .option("--yes", "confirm the deletion")
    .action(
      handle(async (id: string, options: { entity: string; yes?: boolean }, command: Command) => {
        if (!options.yes) throw new CliError("Deleting is permanent. Pass --yes to confirm.");
        const { json, workspace } = globals(command);
        const result = await deleteDocument(await requireWorkspaceId(workspace), options.entity, id);
        if (json) printJson(result);
        else console.log(`Deleted ${id}.`);
      }),
    );
}
