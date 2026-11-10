import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { createLibsqlClient } from "./libsql.ts";

// Applies the pending migrations (drizzle/) to the libSQL database of the Node platform (`npm run db:migrate:node`, run by the
// container before the server starts, see Dockerfile). On Cloudflare D1 they are applied with wrangler (`npm run db:migrate`).

const client = createLibsqlClient();
await migrate(drizzle(client), { migrationsFolder: "drizzle" });
client.close();
console.info("Migrations applied");
