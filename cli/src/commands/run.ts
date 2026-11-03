import type { Command } from "commander";
import { CliError } from "../errors";
import { resolveWorkspaceId } from "../config";

export type GlobalOptions = { json?: boolean; workspace?: string };

export function globals(command: Command) {
  return command.optsWithGlobals<GlobalOptions>();
}

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<void>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(error instanceof CliError ? message : `Unexpected error: ${message}`);
      process.exitCode = 1;
    }
  };
}

export async function requireWorkspaceId(flag?: string) {
  const id = await resolveWorkspaceId(flag);
  if (!id) {
    throw new CliError(
      "No workspace selected. Run `layerum use <workspace>`, set LAYERUM_WORKSPACE, or pass --workspace.",
    );
  }
  return id;
}
