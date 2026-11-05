import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "sqlite",
    schema: "./src/db/schema.d1.ts",
    out: "./drizzle/d1",
    casing: "snake_case",
});
