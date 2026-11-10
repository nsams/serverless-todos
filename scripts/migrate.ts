import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { createLibsqlClient } from "./libsql.ts";

// Applies the pending migrations (drizzle/) to the libSQL database of the bunny.net platform (`npm run db:migrate:bunny`; the deployment
// runs it before the new script is deployed, .github/workflows/bunny.yml). On Cloudflare D1 they are applied with wrangler (`npm run db:migrate`).

const client = createLibsqlClient();
await migrate(drizzle(client), { migrationsFolder: "drizzle" });
client.close();
console.info("Migrations applied");
