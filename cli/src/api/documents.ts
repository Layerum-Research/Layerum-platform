import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { CliError } from "../errors";
import { apiRequest } from "./http";
import type { DataSource, DataSourceError, UploadInit } from "./types";

const POLL_INTERVAL_MS = 2_000;
const WAIT_TIMEOUT_MS = 5 * 60_000;

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".html": "text/html",
};

function sourcesPath(workspaceId: string, entityId: string) {
  return `/workspaces/${encodeURIComponent(workspaceId)}/entities/${encodeURIComponent(entityId)}/sources`;
}

export function listDocuments(workspaceId: string, entityId?: string) {
  // The backend route needs an :entityId segment even for the workspace-wide listing; it ignores the value.
  return apiRequest<DataSource[]>(
    entityId ? sourcesPath(workspaceId, entityId) : `${sourcesPath(workspaceId, "all")}/all`,
  );
}

export function getDocument(workspaceId: string, entityId: string, id: string) {
  return apiRequest<DataSource>(`${sourcesPath(workspaceId, entityId)}/${encodeURIComponent(id)}`);
}

export function getDocumentError(workspaceId: string, entityId: string, id: string) {
  return apiRequest<DataSourceError>(
    `${sourcesPath(workspaceId, entityId)}/${encodeURIComponent(id)}/error`,
  );
}

export function deleteDocument(workspaceId: string, entityId: string, id: string) {
  return apiRequest<{ success: boolean }>(
    `${sourcesPath(workspaceId, entityId)}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function addTextDocument(workspaceId: string, entityId: string, name: string, text: string) {
  return apiRequest<DataSource>(sourcesPath(workspaceId, entityId), {
    method: "POST",
    body: { source_type: "text", display_name: name, raw_text: text },
  });
}

export function addUrlDocument(workspaceId: string, entityId: string, name: string, url: string) {
  return apiRequest<DataSource>(sourcesPath(workspaceId, entityId), {
    method: "POST",
    body: { source_type: "url", display_name: name, source_url: url },
  });
}

export async function addFileDocument(
  workspaceId: string,
  entityId: string,
  filePath: string,
  name?: string,
) {
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) throw new CliError(`${filePath} is not a readable file.`);
  if (info.size === 0) throw new CliError(`${filePath} is empty.`);

  const fileName = basename(filePath);
  const contentType = CONTENT_TYPES[extname(fileName).toLowerCase()] ?? "application/octet-stream";
  const base = sourcesPath(workspaceId, entityId);

  const init = await apiRequest<UploadInit>(`${base}/upload/init`, {
    method: "POST",
    body: { file_name: fileName, content_type: contentType, file_size_bytes: info.size },
  });

  const form = new FormData();
  for (const [key, value] of Object.entries(init.fields)) form.set(key, value);
  form.set("file", new Blob([await readFile(filePath)], { type: contentType }), fileName);

  const upload = await fetch(init.uploadUrl, { method: init.method, body: form });
  if (!upload.ok) throw new CliError(`File upload failed with status ${upload.status}.`);

  return apiRequest<DataSource>(`${base}/upload/complete`, {
    method: "POST",
    body: { upload_id: init.uploadId, display_name: name ?? fileName },
  });
}

export async function waitForDocument(
  workspaceId: string,
  entityId: string,
  id: string,
): Promise<DataSource> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (true) {
    const source = await getDocument(workspaceId, entityId, id);
    if (source.status === "completed") return source;
    if (source.status === "failed") {
      const detail = await getDocumentError(workspaceId, entityId, id);
      throw new CliError(
        `Ingestion failed: ${detail.latestJob.error_message ?? "no error message recorded"}`,
      );
    }
    if (Date.now() >= deadline) {
      throw new CliError(`Timed out waiting for ingestion; status is still "${source.status}".`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
