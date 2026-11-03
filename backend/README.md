# Layerum Backend

## 1) Install and Run

```bash
npm install
npm run start:dev
```

Backend reads config from `backend/.env` (template: `.env.example`). Every variable is described in [docs/configuration.md](../docs/configuration.md#backend).

## 2) Vector store (required for ingestion)

Choose the store with `VECTOR_STORE`:

| `VECTOR_STORE` | Settings | Notes |
|---|---|---|
| `qdrant` (default) | `QDRANT_URL`, `QDRANT_API_KEY` | Local container or Qdrant Cloud |
| `lancedb` | `LANCEDB_URI` (default `./data/lancedb`) | A local directory or `s3://bucket/path`. The API and the worker must use the same location. |
| `pgvector` | `DATABASE_URL` | Vectors live in the `layerum_vectors` schema of that Postgres. The `vector` extension must be available. |

For local development, start Redis and Qdrant from the self-hosting stack:

```bash
cd ../docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d redis qdrant
curl http://localhost:6333/readyz
```

If the vector store is down, ingestion fails on the `vector_upsert` step.

## 2.1) Queue + Worker runtime (recommended)

Run ingestion through queue workers (BullMQ + Redis) instead of in-process timers:

```env
ASYNC_TASKS_MODE=auto # auto | inline | queue | gateway
REDIS_URL=redis://localhost:6379
INGEST_WORKER_CONCURRENCY=2
UPLOAD_CLEANUP_INTERVAL_SECONDS=600
HEALTH_MONITOR_INTERVAL_SECONDS=60 # run only in one worker replica
MODEL_CATALOG_SYNC_INTERVAL_SECONDS=3600
```

Worker start commands:

```bash
npm run build
npm run start:worker
```

Split deployment (optional): when the public API runs where it cannot reach Redis or the vector store directly, run a second backend instance with `INTERNAL_API_ENABLED=true` next to them and point the public API at it:

```env
# public API
INTERNAL_GATEWAY_URL=https://<gateway-host>
VECTOR_GATEWAY_URL=https://<gateway-host>
INTERNAL_GATEWAY_TOKEN=<shared-secret>

# gateway instance
INTERNAL_API_ENABLED=true
INTERNAL_GATEWAY_TOKEN=<shared-secret>
```

## 3) Required env

Minimal keys in `backend/.env`:

```env
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
S3_BUCKET=...
S3_REGION=us-east-1
S3_ENDPOINT= # optional (for MinIO/S3-compatible)
S3_FORCE_PATH_STYLE=false
S3_PRESIGN_TTL_SECONDS=900
S3_SERVER_SIDE_ENCRYPTION=AES256
S3_SSE_KMS_KEY_ID= # optional, only if S3_SERVER_SIDE_ENCRYPTION=aws:kms
ENCRYPTION_KEY=... # 64 hex chars
WORKSPACE_ENCRYPTION_PROVIDER=local_vault # or aws_kms
WORKSPACE_ENCRYPTION_CACHE_TTL_MS=300000
# local/staging:
WORKSPACE_ENCRYPTION_LOCAL_MASTER_KEY=... # 64 hex chars (or fallback to ENCRYPTION_KEY)
# production aws_kms:
WORKSPACE_ENCRYPTION_AWS_KMS_KEY_ID=...
AWS_REGION=us-east-1
REDIS_URL=redis://localhost:6379
VECTOR_STORE=qdrant # qdrant | lancedb | pgvector
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
FRONTEND_ALLOWED_ORIGINS=http://localhost:3000
MAX_UPLOAD_FILE_BYTES=52428800
PORT=4000
NODE_ENV=development
```

Workspace data encryption behavior:
- New ingested chunks are always encrypted (no runtime mode flag).
- If `WORKSPACE_ENCRYPTION_PROVIDER=aws_kms`, install runtime dependency `@aws-sdk/client-kms`.

Important networking note:
- If backend runs on host: keep `QDRANT_URL=http://localhost:6333`.
- If backend runs in Docker Compose: use service DNS, e.g. `QDRANT_URL=http://qdrant:6333`.

CORS and browser access model:
- Browser origins are controlled by `FRONTEND_ALLOWED_ORIGINS` (comma-separated).
- Requests without `Origin` are allowed (server-to-server SDK/API calls).
- Keep this list restricted to first-party frontend domains in production.

## 4) Quick debug checklist for failed ingestion

If source status is `failed`:
1. Open latest `ingestion_jobs` metadata and check `failed_step`.
2. If `failed_step=vector_upsert`, verify the vector store is reachable (for Qdrant: `/readyz`).
3. Retry the source ingestion from UI (`Retry analysis`) after the vector store is healthy.
