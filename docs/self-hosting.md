# Self-hosting Layerum

This guide runs a complete Layerum installation on your own server with Docker Compose. Everything, including the database and authentication, runs in containers on your machine. No external service is required except an SMTP server for email and the AI providers you choose.

## What runs

| Service | Image | Purpose | Host port |
|---|---|---|---|
| `web` | built from `frontend/` | Web app | 3000 |
| `api` | built from `backend/` | REST API | 4000 |
| `worker` | built from `backend/` | Background jobs: document ingestion, cleanup, model catalog sync | – |
| `migrate` | `postgres:17-alpine` | Applies database migrations, then exits | – |
| `redis` | `redis:7-alpine` | Job queue | – |
| `qdrant` | `qdrant/qdrant` | Vector search, when `VECTOR_STORE=qdrant` | – |
| `supabase-db` | `supabase/postgres` | PostgreSQL 17 | – |
| `db-init` | `postgres:17-alpine` | Prepares your own PostgreSQL server for the services below, then exits | – |
| `supabase-auth` | `supabase/gotrue` | Accounts, sessions, MFA, social sign-in | – |
| `supabase-rest` | `postgrest/postgrest` | Database API used by the backend | – |
| `supabase-realtime` | `supabase/realtime` | Live notifications in the browser | – |
| `supabase-storage` | `supabase/storage-api` | Avatar images | – |
| `supabase-gateway` | `nginx` | Single entry point for the four services above | 8000 |
| `storage-s3` | `cgr.dev/chainguard/minio` | S3-compatible storage for uploaded documents | 9000 |

The `supabase-*` services are the open-source components of [Supabase](https://supabase.com), running against your own Postgres. Layerum's hosted version uses Supabase Cloud, so the code is the same in both setups.

Services are grouped with Compose profiles:

- `postgres`: the bundled database. Remove it to use [your own PostgreSQL server](#using-your-own-postgresql-server).
- `supabase`: the auth, REST, realtime and storage services. Remove it together with `postgres` to use [an existing Supabase project](#using-an-existing-supabase-project).
- `qdrant`: the bundled Qdrant. Remove it to use Qdrant Cloud, LanceDB or pgvector (see [Vector store](#vector-store)).
- `s3`: MinIO for documents. Remove it to use AWS S3 or another S3-compatible service.

All four are enabled by default through `COMPOSE_PROFILES` in `docker/.env`.

| Setup | `COMPOSE_PROFILES` |
|---|---|
| Everything in Docker | `postgres,supabase,qdrant,s3` |
| Your own PostgreSQL | `supabase,qdrant,s3` |
| Your own Supabase project | `qdrant,s3` |

## Requirements

- Linux or macOS host with Docker Engine and Docker Compose v2.20 or newer
- 2 CPU cores and 4 GB of RAM at minimum; more for large document sets
- `openssl` (used by `generate-secrets.sh`)
- An SMTP server for account emails (sign-up codes, password resets, notifications)
- An API key for at least one AI provider (OpenAI, Anthropic, Google, Mistral and others) to embed and query documents

## Quick start on your computer

```sh
git clone <this repository> layerum
cd layerum/docker
./generate-secrets.sh
```

`generate-secrets.sh` copies `.env.example` to `.env` and fills every secret with a random value. Running it again keeps existing values.

Open `docker/.env` and set:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM`
- `ADMIN_EMAIL`: receives messages from the feedback form

Then start everything:

```sh
docker compose up -d --build
```

The first build takes several minutes. When it finishes, open http://localhost:3000, sign up and enter the code from the confirmation email.

To use Layerum you then:

1. Create a workspace.
2. Add an AI provider and its API key in the workspace.
3. Choose an embedding model and a chat model.
4. Build your entity tree and add documents.

## Configuration

All settings live in `docker/.env`. Every variable of every component is listed in [configuration.md](configuration.md). After changing it, run `docker compose up -d` again. Changes to the public URLs or `ANON_KEY` also need `docker compose up -d --build web`, because the web app embeds them at build time.

### Public URLs

| Variable | Default | Meaning |
|---|---|---|
| `APP_PUBLIC_URL` | `http://localhost:3000` | Address of the web app |
| `API_PUBLIC_URL` | `http://localhost:4000` | Address of the API |
| `SUPABASE_PUBLIC_URL` | `http://localhost:8000` | Address of the Supabase gateway |
| `S3_PUBLIC_URL` | `http://localhost:9000` | Address of file storage. Browsers upload documents straight to it |

Each must be reachable from your users' browsers.

### Ports

Each published service has a `*_BIND` and a `*_PORT` variable (`APP_*`, `API_*`, `SUPABASE_*`, `S3_*`). Ports bind to `127.0.0.1` by default, so they are only reachable from the host itself. Put a reverse proxy in front (see below), or set `*_BIND=0.0.0.0` for a trusted local network.

### Secrets

| Variable | Used for |
|---|---|
| `POSTGRES_PASSWORD` | Database users |
| `JWT_SECRET` | Signs user sessions. `ANON_KEY` and `SERVICE_ROLE_KEY` are JWTs signed with it |
| `ANON_KEY` | Public key used by the browser |
| `SERVICE_ROLE_KEY` | Full database access for the backend. Keep it private |
| `ENCRYPTION_KEY` | Encrypts provider API keys and workspace data keys. **If you lose it, stored provider keys cannot be decrypted** |
| `API_KEY_HASH_SECRET` | Hashes workspace API keys and CLI tokens |
| `REALTIME_SECRET_KEY_BASE` | Realtime service |
| `QDRANT_API_KEY` | Qdrant access |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | File storage credentials |

If you change `JWT_SECRET`, delete `ANON_KEY` and `SERVICE_ROLE_KEY` from `.env` and run `./generate-secrets.sh` to sign new ones. Then rebuild the web app.

### Email

| Variable | Default | Meaning |
|---|---|---|
| `EMAIL_PROVIDER` | `smtp` | `smtp` or `resend` |
| `EMAIL_FROM` | | Sender address |
| `SMTP_HOST`, `SMTP_PORT` | `587` | SMTP server |
| `SMTP_SECURE` | | `true` for implicit TLS. Defaults to `true` only on port 465. Port 587 uses STARTTLS automatically |
| `SMTP_USER`, `SMTP_PASS` | | Leave empty for a server without authentication |
| `RESEND_API_KEY` | | Only with `EMAIL_PROVIDER=resend` |
| `ADMIN_EMAIL` | | Receives feedback form messages |

To test email locally without a real server, run [Mailpit](https://mailpit.axllent.org) next to the stack and read the messages at http://localhost:8025:

```sh
docker run -d --name mailpit --network layerum_default --network-alias mailpit -p 127.0.0.1:8025:8025 axllent/mailpit
```

Then set `SMTP_HOST=mailpit` and `SMTP_PORT=1025` in `docker/.env` and run `docker compose up -d`.

### Sign-in

| Variable | Default | Meaning |
|---|---|---|
| `DISABLE_SIGNUP` | `false` | `true` stops new registrations |
| `JWT_EXPIRY` | `3600` | Session token lifetime in seconds |
| `GOOGLE_ENABLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_SECRET` | | Sign in with Google |
| `GITHUB_ENABLED`, `GITHUB_CLIENT_ID`, `GITHUB_SECRET` | | Sign in with GitHub |

For Google and GitHub, register an OAuth app with the callback URL `<SUPABASE_PUBLIC_URL>/auth/v1/callback`.

Two-factor authentication with authenticator apps is enabled by default.

### Vector store

| `VECTOR_STORE` | Where vectors live | Settings |
|---|---|---|
| `qdrant` (default) | The bundled Qdrant, or any Qdrant server such as Qdrant Cloud | `QDRANT_URL`, `QDRANT_API_KEY` |
| `lancedb` | Files in the `lancedb-data` volume, or an S3 bucket | `LANCEDB_URI` |
| `pgvector` | The `layerum_vectors` schema of the Layerum database | none |

- **Qdrant Cloud or another Qdrant server:** remove `qdrant` from `COMPOSE_PROFILES` and set `QDRANT_URL` and `QDRANT_API_KEY`.
- **LanceDB:** remove `qdrant` from `COMPOSE_PROFILES`. By default the API and the worker share the `lancedb-data` volume. To keep vectors in S3, set `LANCEDB_URI=s3://bucket/path`; the S3 credentials of the backend are used.
- **pgvector:** remove `qdrant` from `COMPOSE_PROFILES`. The backend creates the `vector` extension and its tables on start. The bundled database and Supabase projects include pgvector; on your own server, install it first. The schema is not exposed through the REST API and the browser roles have no access to it.

Changing the store does not move existing vectors. Re-ingest documents after switching.

### AI providers

Provider base URLs may not point to private or local addresses. To use a model server on your own network, list its host in `PROVIDER_ALLOWED_PRIVATE_HOSTS`, for example `PROVIDER_ALLOWED_PRIVATE_HOSTS=ollama,192.168.1.20`. Only list hosts you control: workspace admins can send requests to them.

### Limits

The application has plan limits for the hosted service. On each start, `migrate` sets them for every user from:

| Variable | Default |
|---|---|
| `WORKSPACE_LIMIT` | `1000` workspaces per user |
| `STORAGE_CAPACITY_GB` | `1000000` GB per user |

## Running on a server with a domain

Use four hostnames, for example:

| Hostname | Proxies to |
|---|---|
| `layerum.example.com` | `127.0.0.1:3000` |
| `api.layerum.example.com` | `127.0.0.1:4000` |
| `auth.layerum.example.com` | `127.0.0.1:8000` |
| `files.layerum.example.com` | `127.0.0.1:9000` |

Set the public URLs in `docker/.env`:

```sh
APP_PUBLIC_URL=https://layerum.example.com
API_PUBLIC_URL=https://api.layerum.example.com
SUPABASE_PUBLIC_URL=https://auth.layerum.example.com
S3_PUBLIC_URL=https://files.layerum.example.com
```

Example [Caddy](https://caddyserver.com) configuration. Caddy gets TLS certificates automatically:

```
layerum.example.com {
  reverse_proxy 127.0.0.1:3000
}

api.layerum.example.com {
  reverse_proxy 127.0.0.1:4000
}

auth.layerum.example.com {
  reverse_proxy 127.0.0.1:8000
}

files.layerum.example.com {
  request_body max_size 60MB
  reverse_proxy 127.0.0.1:9000
}
```

Then rebuild and restart:

```sh
docker compose up -d --build
```

With nginx or another proxy, make sure it supports WebSockets on the auth hostname (used for live notifications), forwards the `Host` header, and allows uploads of at least 60 MB on the files hostname.

## Using an existing Supabase project

You can use Supabase Cloud or your own Supabase installation instead of the bundled database and auth services.

1. In `docker/.env`, remove `postgres` and `supabase` from `COMPOSE_PROFILES`.
2. Set the project values. The database connection is under Project Settings → Database:

   ```sh
   SUPABASE_INTERNAL_URL=https://<project-ref>.supabase.co
   SUPABASE_PUBLIC_URL=https://<project-ref>.supabase.co
   ANON_KEY=<anon key>
   SERVICE_ROLE_KEY=<service_role key>
   JWT_SECRET=<legacy JWT secret>
   DB_HOST=db.<project-ref>.supabase.co
   DB_PORT=5432
   DB_NAME=postgres
   DB_ADMIN_USER=postgres
   DB_ADMIN_PASSWORD=<database password>
   DB_SSLMODE=require
   ```

3. In the Supabase dashboard, under Authentication → URL configuration, set the site URL to `APP_PUBLIC_URL` and add `<APP_PUBLIC_URL>/**` to the redirect URLs. Enable TOTP multi-factor authentication.
4. Run `docker compose up -d --build`. `migrate` creates the schema in the project's database.

Account emails are sent by Layerum's backend through your SMTP settings, not by Supabase.

## Using your own PostgreSQL server

The auth, REST, realtime and storage services can run against any PostgreSQL server: one you run yourself or a managed one. No Supabase account is needed.

1. Use an empty database. PostgreSQL 17 is tested.
2. In `docker/.env`, remove `postgres` from `COMPOSE_PROFILES` and set the connection:

   ```sh
   DB_HOST=db.example.com
   DB_PORT=5432
   DB_NAME=layerum
   DB_ADMIN_USER=postgres
   DB_ADMIN_PASSWORD=<password>
   DB_SSLMODE=require
   ```

   The admin user must be able to create roles, schemas and extensions. The password must be URL-safe or percent-encoded.
3. Run `docker compose up -d --build`. `db-init` creates the roles and schemas that the services and the migrations expect (see `docker/postgres/init.sql`). The service roles get `POSTGRES_PASSWORD` as their password. Then `migrate` creates the Layerum schema.

Live notifications in the browser need logical replication with the `wal2json` plugin, and an admin user with superuser rights:

- set `wal_level = logical` and restart the server;
- install `wal2json` (for example the `postgresql-17-wal2json` package);
- if the server has the `output_plugin_libraries` setting, add `wal2json` to it.

Without these, everything else works and new notifications appear after the page is reloaded.

If you choose `VECTOR_STORE=pgvector`, the server also needs the `vector` extension.

## Using AWS S3 or another S3-compatible storage

1. Remove `s3` from `COMPOSE_PROFILES`.
2. Set the bucket in `docker/.env`:

   ```sh
   S3_BUCKET=my-layerum-bucket
   S3_REGION=eu-central-1
   S3_ENDPOINT=                 # empty for AWS; the endpoint URL for others
   S3_PUBLIC_URL=               # empty for AWS; the public endpoint for others
   S3_FORCE_PATH_STYLE=false
   S3_SERVER_SIDE_ENCRYPTION=AES256
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   ```

3. Allow browser uploads with a CORS rule on the bucket: method `POST`, origin `APP_PUBLIC_URL`, all headers.

## CLI and MCP server

The `layerum` CLI and its MCP server have no default server. Point them at your URLs:

```sh
export LAYERUM_APP_URL=https://layerum.example.com
export LAYERUM_API_URL=https://api.layerum.example.com
layerum login
```

For Claude Code:

```sh
claude mcp add layerum \
  -e LAYERUM_APP_URL=https://layerum.example.com \
  -e LAYERUM_API_URL=https://api.layerum.example.com \
  -- npx -y @layerum-team/cli mcp
```

The SDK needs the API address in its required `baseUrl` option.

## Upgrading

```sh
git pull
cd docker
docker compose up -d --build
```

`migrate` applies new files from `supabase/migrations/` on every start. Applied migrations are recorded in the `layerum_internal.schema_migrations` table, so each runs once.

Back up the database before upgrading.

## Backups

Back up these together:

- `docker/.env`, especially `ENCRYPTION_KEY` and `JWT_SECRET`
- the database. With the bundled database:

  ```sh
  docker compose exec -T supabase-db pg_dump -U supabase_admin -d postgres -Fc > layerum-$(date +%F).dump
  ```

  With your own server or Supabase project, back it up with `pg_dump` or your provider's backups.

- Docker volumes `layerum_s3-data` (documents), `layerum_supabase-storage-data` (avatars), and `layerum_qdrant-data` or `layerum_lancedb-data` (vectors). With pgvector the vectors are in the database. Vectors can be rebuilt by re-ingesting documents, but that costs embedding calls.

## Troubleshooting

| Symptom | Check |
|---|---|
| A service does not start | `docker compose ps -a` and `docker compose logs <service>` |
| `migrate` failed | `docker compose logs migrate`. Fix the cause and run `docker compose up -d` again |
| No sign-up email | `docker compose logs api | grep -i smtp` |
| The browser calls `localhost` on a server | The web app was built with old URLs. Run `docker compose up -d --build web` |
| Document uploads fail | `S3_PUBLIC_URL` must be reachable from the browser, and the proxy must allow large bodies |
| Documents stay in processing | `docker compose logs worker`. The workspace needs an embedding model with a valid provider key |
| `db-init` failed | `docker compose logs db-init`. The admin user from `DB_ADMIN_USER` needs rights to create roles and schemas |
| No live notifications on your own PostgreSQL | `docker compose logs supabase-realtime`. See the `wal2json` requirements above |
| 401 from the auth hostname | `ANON_KEY` in the web build does not match `docker/.env`. Rebuild `web` |

To start over with an empty installation, run `docker compose down -v`. **This deletes all data.**
