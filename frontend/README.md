# Layerum web app

Next.js app for Layerum.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The app needs the backend and Supabase; see [CONTRIBUTING.md](../CONTRIBUTING.md) for a local setup.

Environment variables are listed in [docs/configuration.md](../docs/configuration.md#frontend). `NEXT_PUBLIC_*` values are embedded at build time.

Checks:

```sh
npm run lint
npx tsc --noEmit
npm run test:csp
npm run build
```
