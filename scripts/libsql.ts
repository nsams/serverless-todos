import { mkdirSync } from "node:fs";

import { createClient } from "@libsql/client";

// The libSQL database of the bunny.net platform (like src/server.bunny.ts): the Bunny Database in BUNNY_DATABASE_URL / BUNNY_DATABASE_AUTH_TOKEN,
// locally a SQLite file. In CI (the deployment) BUNNY_DATABASE_URL is required: a local file would let the migrations "succeed" unnoticed.
export function createLibsqlClient() {
    if (process.env.CI && !process.env.BUNNY_DATABASE_URL) {
        throw new Error("BUNNY_DATABASE_URL is not set (GitHub secret, see README)");
    }
    const url = process.env.BUNNY_DATABASE_URL || "file:.data/app.db";
    if (url.startsWith("file:")) {
        mkdirSync(".data", { recursive: true });
    }
    return createClient({ url, authToken: process.env.BUNNY_DATABASE_AUTH_TOKEN || undefined });
}
