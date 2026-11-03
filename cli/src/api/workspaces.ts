import { writeConfig } from "../config";
import { CliError } from "../errors";
import { apiRequest } from "./http";
import type { Workspace, WorkspaceMembership } from "./types";

export function listWorkspaces() {
  return apiRequest<WorkspaceMembership[]>("/workspaces");
}

export function findWorkspace(memberships: WorkspaceMembership[], query: string): Workspace {
  const byId = memberships.find((m) => m.workspace.id === query);
  if (byId) return byId.workspace;

  const matches = memberships.filter((m) => m.workspace.name === query || m.workspace.slug === query);
  if (matches.length === 1) return matches[0].workspace;
  if (matches.length > 1) {
    throw new CliError(
      `"${query}" matches ${matches.length} workspaces. Use the workspace id: ${matches
        .map((m) => m.workspace.id)
        .join(", ")}`,
    );
  }
  throw new CliError(`No workspace matches "${query}". List them with \`layerum workspaces\`.`);
}

export async function useWorkspace(query: string): Promise<Workspace> {
  const workspace = findWorkspace(await listWorkspaces(), query);
  await writeConfig({ workspaceId: workspace.id });
  return workspace;
}

export async function selectOnlyWorkspace(): Promise<Workspace | null> {
  const memberships = await listWorkspaces();
  if (memberships.length !== 1) return null;
  const workspace = memberships[0].workspace;
  await writeConfig({ workspaceId: workspace.id });
  return workspace;
}
