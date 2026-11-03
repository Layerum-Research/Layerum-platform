# Contributing

Thanks for helping improve Layerum.

## Before you start

- For bugs, open an issue with steps to reproduce.
- For larger changes, open an issue first so we can agree on the approach.
- Security problems go through [SECURITY.md](SECURITY.md), not issues.

## Local setup

1. Start the dependencies without the app containers:

   ```sh
   cd docker
   ./generate-secrets.sh
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d migrate supabase-gateway storage-bucket redis qdrant
   ```

   This publishes Redis on 6379 and Qdrant on 6333 for local use.
2. Backend: `cd backend && npm ci`, copy `.env.example` to `.env`, then `npm run start:dev`. Take the values from `docker/.env`:
   - `SUPABASE_URL=http://localhost:8000`, `SUPABASE_ANON_KEY` = `ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` = `SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` = `JWT_SECRET`
   - `S3_ENDPOINT=http://localhost:9000`, `S3_FORCE_PATH_STYLE=true`, `S3_SERVER_SIDE_ENCRYPTION=none`, `S3_BUCKET=layerum-sources`, and `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` = `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
   - `ENCRYPTION_KEY`, `QDRANT_API_KEY` and `REDIS_URL=redis://localhost:6379`
3. Frontend: `cd frontend && npm ci`, copy `.env.example` to `.env.local`, set `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `ANON_KEY`, then `npm run dev`.

## Checks

Run these before opening a pull request:

```sh
cd backend && npm run build && npm test
cd frontend && npm run lint && npx tsc --noEmit && npm run test:csp
cd cli && npm run build && npm test
```

## Guidelines

- Keep changes small and focused, and follow the patterns already in the code.
- Add or update tests for behavior you change.
- Database changes go into a new numbered file in `supabase/migrations/`. Migrations must be additive so the running version keeps working, and new tables need row level security enabled.
- Every user-facing string in the frontend needs a translation in all locale files in `frontend/messages/`.

## License

By contributing, you agree that your contributions are licensed under the license of the part of the repository you change: Elastic License 2.0 for the application, Apache 2.0 for `cli/` and `sdk/rag-sdk/`.
