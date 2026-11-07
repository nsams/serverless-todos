import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createFixturesSql } from "./fixtures.ts";
import { wrangler } from "./wrangler.ts";

// Inserts the fixtures (scripts/fixtures.ts) for DEV_USER_EMAIL into the local D1 database (`npm run db:seed`)

const email = process.env.DEV_USER_EMAIL;
if (!email) {
    console.error("DEV_USER_EMAIL is not set (.env/.env.local)");
    process.exit(1);
}

const seedFile = join(".wrangler", "seed.sql");
mkdirSync(".wrangler", { recursive: true });
writeFileSync(seedFile, createFixturesSql([email]));
wrangler(["d1", "execute", "DB", "--local", "--file", seedFile]);
