import { apiRequest } from "./http";
import type { QueryResult } from "./types";

export type QueryInput = {
  workspaceId: string;
  entityId: string;
  modelConfigId: string;
  query: string;
  topK?: number;
};

export function runQuery(input: QueryInput) {
  return apiRequest<QueryResult>("/query", { method: "POST", body: input });
}
