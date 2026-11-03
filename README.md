# serverless-todos

Minimal todo app: React Router (framework mode) on Cloudflare Workers, MUI + DataGrid, Drizzle, OIDC login.

Locally the app runs in the real Workers runtime (workerd) via `@cloudflare/vite-plugin`; D1 is emulated as a local SQLite database in `.wrangler/`.

## Setup

```bash
./install.sh
```

## Development

```bash
npm run dev           # dev-oidc-provider + app with D1 (http://localhost:5180)
npm run dev:postgres  # dev-oidc-provider + docker compose postgres + app with PostgreSQL (via Hyperdrive)
```

Processes are managed by [dev-process-manager](https://www.npmjs.com/package/dev-process-manager) (`npx dev-pm status`, `npx dev-pm logs`, `npx dev-pm stop`).

Login users are defined in `dev-oidc-provider.config.mts`.

## Database

Two dialects with one schema each (`app/db/schema.d1.ts`, `app/db/schema.pg.ts`) and a common repository (`app/db/todos.server.ts`). The dialect is selected by the wrangler environment (`DB_DIALECT`).

After changing a schema (keep both in sync):

```bash
npm run db:generate     # generates migrations into drizzle/d1 and drizzle/pg
npm run db:migrate:d1   # local D1
npm run db:migrate:pg   # postgres from DATABASE_URL
```

## Deployment (Cloudflare)

1. Replace the placeholder ids and `OIDC_*` vars in `wrangler.jsonc` (D1: `wrangler d1 create serverless-todos`, Hyperdrive: `wrangler hyperdrive create`).
2. Set secrets: `wrangler secret put OIDC_CLIENT_SECRET`, `wrangler secret put SESSION_SECRET`
3. Migrate: `npm run db:migrate:d1:remote` (or `DATABASE_URL=… npm run db:migrate:pg`)
4. Deploy: `npm run deploy` (D1) or `npm run deploy:postgres`
