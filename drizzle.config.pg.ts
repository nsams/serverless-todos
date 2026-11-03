import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "postgresql",
    schema: "./app/db/schema.pg.ts",
    out: "./drizzle/pg",
    casing: "snake_case",
    dbCredentials: {
        url: process.env.DATABASE_URL ?? "",
    },
});
