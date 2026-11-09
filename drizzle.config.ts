import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "sqlite",
    // the tables of all modules; one migration history for the database (drizzle/)
    schema: "./src/modules/*/db/schema.ts",
    out: "./drizzle",
    casing: "snake_case",
});
