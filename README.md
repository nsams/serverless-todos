# serverless-todos

Minimal todo app: React Router (framework mode) on Cloudflare Workers, MUI + DataGrid, MikroORM, OIDC login.

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

[MikroORM](https://mikro-orm.io) v7 with one entity definition for both dialects (`app/db/todo.entity.ts`, `defineEntity`, no decorators) and a common repository (`app/db/todos.server.ts`). The dialect is selected by the wrangler environment (`DB_DIALECT`):

- D1: generic SQLite driver of `@mikro-orm/sql` with the Kysely dialect from `kysely-d1` (no transactions, D1 doesn't support them)
- PostgreSQL: `@mikro-orm/postgresql` (`pg`) via Hyperdrive

Workers don't allow `new Function()`, so the functions MikroORM generates at runtime (hydrators, comparators, ...) are pre-compiled with `npm run orm:compile` into `app/db/compiled-functions.*.js` (not committed, runs as part of `typegen`, `build` and `db:generate`).

After changing the entity:

```bash
npm run db:generate     # migrations into migrations/d1 (SQL for wrangler) and migrations/pg (MikroORM migrator), recompiles functions
npm run db:migrate:d1   # local D1
npm run db:migrate:pg   # postgres from DATABASE_URL
```

Migrations are diffed against the schema snapshots (`migrations/*/.snapshot.json`), no database connection is needed to generate them. The CLI configs are `mikro-orm.config.d1.ts` and `mikro-orm.config.pg.ts`.

## Deployment (Cloudflare)

1. Replace the placeholder ids and `OIDC_*` vars in `wrangler.jsonc` (D1: `wrangler d1 create serverless-todos`, Hyperdrive: `wrangler hyperdrive create`).
2. Set secrets: `wrangler secret put OIDC_CLIENT_SECRET`, `wrangler secret put SESSION_SECRET`
3. Migrate: `npm run db:migrate:d1:remote` (or `DATABASE_URL=… npm run db:migrate:pg`)
4. Deploy: `npm run deploy` (D1) or `npm run deploy:postgres`
