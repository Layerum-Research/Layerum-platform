export class LayerumApiError extends Error {
  status: number;
  details?: unknown;
  path?: string;
  method?: string;

  constructor(
    message: string,
    status: number,
    details?: unknown,
    method?: string,
    path?: string,
  ) {
    super(message);
    this.name = "LayerumApiError";
    this.status = status;
    this.details = details;
    this.method = method;
    this.path = path;
  }
}
