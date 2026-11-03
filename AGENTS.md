# Layerum

Multi-tenant AI knowledge platform. This file describes how the repository is laid out and the rules for changing it.

## Repository layout

| Path | What it is |
|---|---|
| `backend/` | NestJS API. The same code runs as the public API (`src/main.ts`), as an optional internal gateway (`main.ts` with `INTERNAL_API_ENABLED=true`) and as the background worker (`src/worker.ts`). |
| `frontend/` | Next.js app (has its own `AGENTS.md` with Next.js rules). |
| `cli/` | `@layerum-team/cli`: command line client and MCP server. |
| `sdk/rag-sdk/` | `@layerum-team/rag-sdk`: TypeScript SDK. |
| `supabase/migrations/` | Numbered SQL migrations (`NNN_name.sql`). |
| `docker/` | Self-hosting stack. `docker/postgres/init.sql` prepares a plain PostgreSQL server for the Supabase services. |
| `docs/` | Public documentation: `self-hosting.md` and `configuration.md` (every environment variable). |
| `.github/workflows/ci.yml` | Builds and tests on every push and pull request. |

## Storage backends

- Database: the bundled `supabase/postgres` container, your own PostgreSQL server with the open-source Supabase services in front of it, or an existing Supabase project. The backend talks to the database through `supabase-js`, so all three must expose the same Supabase APIs.
- Vector store: chosen with `VECTOR_STORE` (`qdrant`, `lancedb` or `pgvector`). Every store implements `VectorStore` in `backend/src/vector/vector-store.ts`; callers use `VectorService` only. A new store must keep search filtered by workspace and entity, and must never build queries from unvalidated input.
- Files: any S3-compatible storage.

## Database migrations

- Add a new file in `supabase/migrations/` with the next number and update `backend/src/supabase/database.types.ts`.
- `docker/migrate.sh` applies migrations in order and records them in `layerum_internal.schema_migrations`.
- Write migrations so the previous version of the code keeps working with them (additive changes).
- New functions must not be executable by `anon` or `authenticated` unless that is intended: revoke execute explicitly, as in `040_revoke_rpc_execute.sql`.
- New tables need row level security enabled.

## Secrets and environment

- Never read or print values from `.env` files. To check what is configured, list variable names only.
- Example files: `backend/.env.example`, `frontend/.env.example`, `docker/.env.example`. Real `.env` files are never committed.
- A new environment variable goes into the matching `.env.example` and `docs/configuration.md`.
- The CLI and the SDK have no default server URL. Do not add one.
- The backend refuses to start without `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `S3_BUCKET` and a 64-character hex `ENCRYPTION_KEY`.

## Checks to run before pushing

```
cd backend && npm run build && npm test
cd frontend && npm run lint && npx tsc --noEmit && npm run test:csp
cd cli && npm run build && npm test
```

`backend/src/vector/pgvector.vector-store.spec.ts` runs only when `TEST_DATABASE_URL` points to a PostgreSQL database with the `vector` extension available.

`frontend/package-lock.json` must stay in sync with `package.json`: CI installs with `npm ci` on Node 22.

Backend ESLint is not part of CI because the codebase has many existing lint errors. Do not add it without fixing them first.
