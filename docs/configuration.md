# Configuration reference

Every environment variable Layerum reads, by component.

- Docker stack: `docker/.env`, described in [self-hosting.md](self-hosting.md#configuration). Start there if you run Layerum with Docker.
- Backend run directly (`npm run start:dev`, `npm run start:worker`): `backend/.env`, template `backend/.env.example`.
- Frontend run directly (`npm run dev`, `npm run build`): `frontend/.env.local`, template `frontend/.env.example`.
- CLI, MCP server and SDK: variables of the machine where they run.

Never commit real `.env` files.

## Backend

The API (`src/main.ts`) and the worker (`src/worker.ts`) read the same variables. Run them with the same values.

### Server

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | HTTP port |
| `NODE_ENV` | `development` | `production` turns off Swagger (`/api`) and hides internal error details |
| `FRONTEND_URL` | | Web app URL. Used for password reset and two-factor recovery links in emails |
| `FRONTEND_ALLOWED_ORIGINS` | `FRONTEND_URL` | Comma-separated browser origins allowed by CORS. Requests without an `Origin` header (SDK, CLI, servers) are always allowed |
| `TRUST_PROXY` | `false` | Express `trust proxy`: `true`, `false`, a number of proxy hops, or a list of addresses. Set it behind a reverse proxy so client IPs are correct for rate limiting |
| `MAX_UPLOAD_FILE_BYTES` | `52428800` | Largest document upload (50 MB) |

### Supabase

| Variable | Default | Meaning |
|---|---|---|
| `SUPABASE_URL` | | **Required.** Supabase URL the backend calls |
| `SUPABASE_PUBLIC_URL` | `SUPABASE_URL` | Supabase URL as browsers see it. Set it when `SUPABASE_URL` is an internal address. It is also the expected token issuer |
| `SUPABASE_ANON_KEY` | | **Required.** Public (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | | **Required.** Service role key. Keep it private |
| `SUPABASE_JWT_SECRET` | | JWT secret. Required when sessions are signed with a shared secret (HS256), which is the default of self-hosted Supabase. Not used with asymmetric signing keys, which are checked through the project's JWKS |

### Encryption and keys

| Variable | Default | Meaning |
|---|---|---|
| `ENCRYPTION_KEY` | | **Required.** 64 hex characters (32 bytes). Encrypts provider API keys. If you lose it, stored provider keys cannot be decrypted |
| `API_KEY_HASH_SECRET` | `ENCRYPTION_KEY` | Secret for hashing workspace API keys and CLI tokens. Changing it invalidates all existing keys and tokens |
| `WORKSPACE_ENCRYPTION_PROVIDER` | `local_vault` | How workspace data keys are protected: `local_vault` or `aws_kms` |
| `WORKSPACE_ENCRYPTION_LOCAL_MASTER_KEY` | `ENCRYPTION_KEY` | 64 hex characters. Master key for `local_vault` |
| `WORKSPACE_ENCRYPTION_AWS_KMS_KEY_ID` | | KMS key for `aws_kms`. Also install `@aws-sdk/client-kms` |
| `WORKSPACE_ENCRYPTION_CACHE_TTL_MS` | `300000` | How long decrypted data keys stay in memory |
| `AWS_REGION` | `us-east-1` | Region for KMS, and for S3 when `S3_REGION` is empty |

### File storage (S3 compatible)

| Variable | Default | Meaning |
|---|---|---|
| `S3_BUCKET` | | **Required.** Bucket for uploaded documents |
| `S3_REGION` | `AWS_REGION` | Bucket region |
| `S3_ENDPOINT` | | Endpoint for MinIO or another S3-compatible service. Empty for AWS S3 |
| `S3_PUBLIC_ENDPOINT` | `S3_ENDPOINT` | Endpoint browsers use for presigned uploads, when it differs from `S3_ENDPOINT` |
| `S3_FORCE_PATH_STYLE` | `false` | `true` for MinIO and most S3-compatible services |
| `S3_PRESIGN_TTL_SECONDS` | `900` | Lifetime of presigned upload URLs (minimum 60) |
| `S3_UPLOAD_SESSION_GRACE_SECONDS` | `300` | Extra time before an unfinished upload is cleaned up |
| `S3_SERVER_SIDE_ENCRYPTION` | `AES256` | `AES256`, `aws:kms`, or `none` for services without server-side encryption |
| `S3_SSE_KMS_KEY_ID` | | KMS key for `aws:kms` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | | S3 credentials. Any source of the AWS SDK default chain works too (instance role, profile) |

### Vector store

| Variable | Default | Meaning |
|---|---|---|
| `VECTOR_STORE` | `qdrant` | `qdrant`, `lancedb` or `pgvector` |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant server or Qdrant Cloud cluster |
| `QDRANT_API_KEY` | | Qdrant API key |
| `LANCEDB_URI` | `./data/lancedb` | Local directory or `s3://bucket/path`. The API and the worker must use the same location |
| `DATABASE_URL` | | PostgreSQL connection string for `pgvector`, for example `postgres://user:password@host:5432/postgres?sslmode=require`. The user must be able to create the `vector` extension and the `layerum_vectors` schema |

Changing `VECTOR_STORE` does not move existing vectors. Re-ingest documents after switching.

### AI providers

| Variable | Default | Meaning |
|---|---|---|
| `PROVIDER_ALLOWED_PRIVATE_HOSTS` | | Comma-separated host names or IP addresses that a provider base URL may point to even though they are private, for example `ollama,192.168.1.20`. Provider base URLs to private and local addresses are refused otherwise. Only list hosts you control: workspace admins can send requests to them |

### Background work

| Variable | Default | Meaning |
|---|---|---|
| `REDIS_URL` | | Redis for the job queue. Without it, jobs run inside the API process |
| `ASYNC_TASKS_MODE` | `auto` | `auto`, `inline`, `queue` or `gateway`. `auto` uses the gateway when `INTERNAL_GATEWAY_URL` is set, then the queue when `REDIS_URL` is set, otherwise runs jobs inline |
| `INGEST_WORKER_CONCURRENCY` | `2` | Documents ingested in parallel by one worker |
| `UPLOAD_CLEANUP_INTERVAL_SECONDS` | `600` | How often unfinished uploads are cleaned up |
| `LOGS_RETENTION_DAYS` | `90` | Query and audit logs older than this are deleted |
| `LOGS_RETENTION_INTERVAL_SECONDS` | `86400` | How often old logs are deleted |
| `HEALTH_MONITOR_INTERVAL_SECONDS` | `60` | How often the worker checks the database, vector store and Redis and sends system health notifications. Run it in one worker only |
| `MODEL_CATALOG_SYNC_INTERVAL_SECONDS` | `3600` | How often the model catalog is refreshed |

### Internal gateway (optional)

For split deployments where the public API cannot reach Redis or the vector store. Run a second backend instance with `INTERNAL_API_ENABLED=true` next to them.

| Variable | Default | Meaning |
|---|---|---|
| `INTERNAL_API_ENABLED` | `false` | `true` on the gateway instance |
| `INTERNAL_GATEWAY_TOKEN` | | Shared secret, the same on both instances |
| `INTERNAL_GATEWAY_URL` | | On the public API: gateway URL for background jobs |
| `VECTOR_GATEWAY_URL` | | On the public API: gateway URL for vector operations |

### Rate limiting (optional)

Rate limiting uses Redis over the Upstash REST API.

| Variable | Default | Meaning |
|---|---|---|
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | | Upstash REST endpoint. The names `KV_REST_API_*` and `UPSTASH_REDIS_KV_REST_API_*` are accepted too. Also used to cache usage data |
| `RATE_LIMIT_ENABLED` | `true` when the REST endpoint is set | Turn rate limiting on or off |
| `RATE_LIMIT_MODE` | `enforce` | `enforce` blocks requests over the limit, `observe` only logs them |
| `RATE_LIMIT_PREFIX` | `layerum:<NODE_ENV>` | Key prefix in Redis |
| `RATE_LIMIT_TIMEOUT_MS` | `750` | Timeout for one rate limit check |
| `RATE_LIMIT_ANALYTICS` | `false` | Upstash analytics |
| `RATE_LIMIT_HASH_SECRET` | `SUPABASE_JWT_SECRET` | Secret for hashing client identifiers in Redis keys |

When the REST endpoint cannot be reached, password sign-in is refused and other requests are let through.

### Email

| Variable | Default | Meaning |
|---|---|---|
| `EMAIL_PROVIDER` | `resend` | `resend` or `smtp` |
| `EMAIL_FROM` | `RESEND_FROM_EMAIL` | **Required to send email.** Sender address |
| `RESEND_API_KEY` | | Resend API key |
| `RESEND_FROM_EMAIL` | | Older name for `EMAIL_FROM` |
| `RESEND_FROM_NOTIFICATION_EMAIL` | `EMAIL_FROM` | Sender for notification emails |
| `SMTP_HOST`, `SMTP_PORT` | port `587` | SMTP server |
| `SMTP_SECURE` | `true` only on port 465 | Implicit TLS. Port 587 uses STARTTLS automatically |
| `SMTP_USER`, `SMTP_PASS` | | Empty for a server without authentication |
| `CONTACT_REQUESTS_EMAIL` | | Receives contact requests. Without it the endpoint answers `502 Email service is not configured` |
| `FEEDBACK_EMAIL` | | Receives feedback form messages. Without it the endpoint answers `502 Email service is not configured` |

## Frontend

`NEXT_PUBLIC_*` values are embedded at build time. Rebuild the app after changing them.

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:4000` | Backend API URL as browsers see it. Also shown in the docs pages and code examples |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Web app URL. Used for metadata, `sitemap.xml`, `robots.txt` and the CLI and MCP examples |
| `NEXT_PUBLIC_SUPABASE_URL` | | **Required.** Supabase URL as browsers see it |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | | **Required.** Supabase public (anon) key |
| `CSP_CONNECT_SRC_EXTRA` | | Extra origins the browser may connect to, separated by spaces. Add the S3 public endpoint here so direct uploads are allowed |
| `NEXT_OUTPUT` | | `standalone` builds a self-contained server. Set by the Docker image |

## CLI and MCP server

| Variable | Meaning |
|---|---|
| `LAYERUM_APP_URL` | **Required for login.** Web app URL, for example `http://localhost:3000` |
| `LAYERUM_API_URL` | **Required for login.** API URL, for example `http://localhost:4000`. Saved with the credentials, so other commands do not need it |
| `LAYERUM_WORKSPACE` | Workspace to use. Overrides `layerum use`; `--workspace` overrides this |
| `XDG_CONFIG_HOME` | Base directory for credentials and config on macOS and Linux. Default `~/.config` |
| `APPDATA` | Base directory for credentials and config on Windows |

For MCP clients, set the variables in the client's server config. See [self-hosting.md](self-hosting.md#cli-and-mcp-server).

## SDK

The SDK reads no environment variables. Pass the API URL and key to the client:

```ts
const client = new LayerumClient({
  apiKey: process.env.LAYERUM_API_KEY!,
  baseUrl: process.env.LAYERUM_API_URL!,
});
```

`baseUrl` is required.

## Docker stack: other backend variables

`docker/docker-compose.yml` passes only the variables listed in `docker/.env.example` to the backend. To set another backend variable from the tables above, add it to both `api` and `worker` in `docker/docker-compose.override.yml`, which Docker Compose loads automatically:

```yaml
services:
  api:
    environment:
      LOGS_RETENTION_DAYS: "30"
      TRUST_PROXY: "1"
  worker:
    environment:
      LOGS_RETENTION_DAYS: "30"
      TRUST_PROXY: "1"
```
