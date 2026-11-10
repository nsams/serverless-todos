import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "sqlite",
    // the tables of all modules and the chat history; one migration history for the database (drizzle/, applied with wrangler on D1,
    // with scripts/migrate.ts on libSQL)
    schema: ["./src/modules/*/db/schema.ts", "./src/chat/db/schema.ts"],
    out: "./drizzle",
    casing: "snake_case",
});
