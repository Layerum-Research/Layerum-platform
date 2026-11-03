import { LayerumApiError } from "./error";
import type { RequestMethod } from "./types";

type HttpClientOptions = {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
};

type RequestOptions = {
  method?: RequestMethod;
  body?: unknown;
  isFormData?: boolean;
};

function normalizeErrorMessage(payload: unknown, status: number) {
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

function shouldRetry(status: number, method: RequestMethod, attempt: number, maxRetries: number) {
  if (attempt >= maxRetries) return false;
  if (method === "POST" || method === "PATCH" || method === "DELETE") return false;
  return status === 429 || status >= 500;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
    this.maxRetries = options.maxRetries;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";

    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: options.isFormData
            ? { Authorization: `Bearer ${this.apiKey}` }
            : {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
              },
          body:
            options.body === undefined
              ? undefined
              : options.isFormData
                ? (options.body as BodyInit)
                : JSON.stringify(options.body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { message?: unknown; details?: unknown }
            | null;
          const message = normalizeErrorMessage(payload, response.status);
          if (shouldRetry(response.status, method, attempt, this.maxRetries)) {
            attempt += 1;
            await sleep(250 * attempt);
            continue;
          }
          throw new LayerumApiError(
            message,
            response.status,
            payload?.details,
            method,
            path,
          );
        }

        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof LayerumApiError) throw error;
        const message =
          error instanceof Error ? error.message : "Unknown network error";
        throw new LayerumApiError(
          `Network error while ${method} ${path}: ${message}`,
          0,
          error,
          method,
          path,
        );
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}
