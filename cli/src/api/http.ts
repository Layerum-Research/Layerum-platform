import { readCredentials } from "../config";
import { ApiError, CliError, NotLoggedInError } from "../errors";

export type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
};

const REQUEST_TIMEOUT_MS = 120_000;

export function normalizeErrorMessage(payload: unknown, status: number) {
  const fallback = `Request failed (${status})`;
  if (!payload || typeof payload !== "object") return fallback;

  const message = (payload as { message?: unknown }).message;
  if (Array.isArray(message)) {
    return message
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join(", ");
  }
  if (typeof message === "string") return message;
  if (message && typeof message === "object") {
    const nested = (message as { message?: unknown }).message;
    if (typeof nested === "string") return nested;
  }
  return fallback;
}

export async function request<T>(
  baseUrl: string,
  token: string | null,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new CliError(`Network error while ${method} ${path}: ${reason}`);
  }

  if (!response.ok) {
    if (token && response.status === 401) throw new NotLoggedInError();
    const payload = await response.json().catch(() => null);
    throw new ApiError(
      normalizeErrorMessage(payload, response.status),
      response.status,
      method,
      path,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const credentials = await readCredentials();
  if (!credentials) throw new NotLoggedInError();
  return request<T>(credentials.apiUrl, credentials.accessToken, path, options);
}
