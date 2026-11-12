import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "sqlite",
    // the tables of all modules and the core's history (src/history/); one migration history for the database (drizzle/)
    schema: ["./src/modules/*/db/schema.ts", "./src/history/schema.ts"],
    out: "./drizzle",
    casing: "snake_case",
});
