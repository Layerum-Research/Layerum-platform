import { CliError } from "../errors";
import { apiRequest } from "./http";
import type { ModelConfig } from "./types";

export function listModelConfigs(workspaceId: string) {
  return apiRequest<ModelConfig[]>(`/workspaces/${encodeURIComponent(workspaceId)}/model-configs`);
}

export async function resolveModelConfigId(workspaceId: string, requested?: string) {
  if (requested) return requested;
  const configs = await listModelConfigs(workspaceId);
  const fallback = configs.find((config) => config.is_default);
  if (fallback) return fallback.id;

  if (configs.length === 0) {
    throw new CliError("This workspace has no model configs. Create one in the Layerum dashboard.");
  }
  const choices = configs.map((config) => `  ${config.id}  ${config.name}`).join("\n");
  throw new CliError(
    `No default model config in this workspace. Pass --model <id> (CLI) or model_config_id (MCP). Available:\n${choices}`,
  );
}
