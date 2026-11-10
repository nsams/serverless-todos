import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createFixturesSql } from "./fixtures.ts";
import { createLibsqlClient } from "./libsql.ts";
import { wrangler } from "./wrangler.ts";

// Inserts the fixtures (scripts/fixtures.ts) for DEV_USER_EMAIL into the local database: D1 (`npm run db:seed`) or, with PLATFORM=bunny,
// the libSQL database of the bunny.net platform (`npm run db:seed:bunny`)

const email = process.env.DEV_USER_EMAIL;
if (!email) {
    console.error("DEV_USER_EMAIL is not set (.env/.env.local)");
    process.exit(1);
}
const sql = createFixturesSql([email]);

if (process.env.PLATFORM === "bunny") {
    const client = createLibsqlClient();
    await client.executeMultiple(sql);
    client.close();
} else {
    const seedFile = join(".wrangler", "seed.sql");
    mkdirSync(".wrangler", { recursive: true });
    writeFileSync(seedFile, sql);
    wrangler(["d1", "execute", "DB", "--local", "--file", seedFile]);
}
