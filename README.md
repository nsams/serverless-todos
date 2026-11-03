# serverless-todos

Minimal todo app: React Router (framework mode) on Cloudflare Workers, MUI + DataGrid, Kysely, OIDC login.

Locally the app runs in the real Workers runtime (workerd) via `@cloudflare/vite-plugin`; D1 is emulated as a local SQLite database in `.wrangler/`.

## Setup

```bash
./install.sh
```

## Development

```bash
pnpm dev            # dev-oidc-provider + app with D1 (http://localhost:5180)
pnpm dev:postgres   # dev-oidc-provider + docker compose postgres + app with PostgreSQL (via Hyperdrive)
```

Processes are managed by [dev-process-manager](https://www.npmjs.com/package/dev-process-manager) (`npx dev-pm status`, `npx dev-pm logs`, `npx dev-pm stop`).

Login users are defined in `dev-oidc-provider.config.mts`.

## Database

[Kysely](https://kysely.dev) with one schema type for both dialects (`app/db/db.server.ts`) and a common repository (`app/db/todos.server.ts`). The dialect is selected by the wrangler environment (`DB_DIALECT`):

- D1: own minimal dialect (`app/db/d1-dialect.ts`), stores booleans as 0/1 and dates as epoch milliseconds. No transactions.
- PostgreSQL: Kysely's `PostgresDialect` with `pg` via Hyperdrive.

Migrations are written once in TypeScript with the Kysely schema builder (`migrations/*.ts`). Column types that differ between the dialects come from the migration context (`types.uuid`, `types.boolean`, `types.timestamp`).

After adding a migration:

```bash
pnpm db:generate     # compiles migrations to SQL for D1 (migrations/d1, applied by wrangler)
pnpm db:migrate:d1   # local D1
pnpm db:migrate:pg   # postgres from DATABASE_URL (Kysely Migrator)
```

## Deployment (Cloudflare)

1. Replace the placeholder ids and `OIDC_*` vars in `wrangler.jsonc` (D1: `wrangler d1 create serverless-todos`, Hyperdrive: `wrangler hyperdrive create`).
2. Set secrets: `wrangler secret put OIDC_CLIENT_SECRET`, `wrangler secret put SESSION_SECRET`
3. Migrate: `pnpm db:migrate:d1:remote` (or `DATABASE_URL=… pnpm db:migrate:pg`)
4. Deploy: `pnpm deploy` (D1) or `pnpm deploy:postgres`
