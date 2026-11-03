import { Migrator } from "@mikro-orm/migrations";
import { defineConfig } from "@mikro-orm/postgresql";

import { TodoSchema } from "./app/db/todo.entity";

export default defineConfig({
    clientUrl: process.env.DATABASE_URL,
    entities: [TodoSchema],
    extensions: [Migrator],
    migrations: { path: "migrations/pg", snapshotName: ".snapshot" },
});
