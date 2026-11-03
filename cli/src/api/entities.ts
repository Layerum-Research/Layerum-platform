import { apiRequest } from "./http";
import type { Entity, EntityNode } from "./types";

export function getEntityTree(workspaceId: string) {
  return apiRequest<EntityNode[]>(`/workspaces/${encodeURIComponent(workspaceId)}/entities/tree`);
}

export function flattenEntityTree(nodes: EntityNode[]): Entity[] {
  return nodes.flatMap(({ children, ...entity }) => [entity, ...flattenEntityTree(children)]);
}
