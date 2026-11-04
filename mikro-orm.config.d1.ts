import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { MigrationGenerator, Migrator } from "@mikro-orm/migrations";
import { defineConfig, NodeSqliteDialect, SqliteDriver } from "@mikro-orm/sql";

import { TodoSchema } from "./app/db/todo.entity";

const migrationsPath = "migrations/d1";

// Writes plain SQL files for `wrangler d1 migrations apply` instead of migration classes
class D1MigrationGenerator extends MigrationGenerator {
    override async generate(diff: { up: string[] }, path = migrationsPath, name = "migration"): Promise<[string, string]> {
        const sequences = (await readdir(path)).map((file) => Number(/^(\d+)_.*\.sql$/.exec(file)?.[1] ?? -1));
        const fileName = `${String(Math.max(-1, ...sequences) + 1).padStart(4, "0")}_${name.replace(/\W+/g, "_")}.sql`;
        const code = this.generateMigrationFile(fileName, diff);
        await writeFile(join(path, fileName), code);
        return [code, fileName];
    }

    override generateMigrationFile(_className: string, diff: { up: string[] }) {
        return `${diff.up.join("\n").trim()}\n`;
    }
}

// Only used to generate migrations (`npm run db:generate`), they are applied with wrangler.
// The schema is diffed against migrations/d1/.snapshot.json, the in-memory database is only needed for the initial migration.
export default defineConfig({
    driver: SqliteDriver,
    dbName: ":memory:",
    driverOptions: new NodeSqliteDialect(":memory:"),
    entities: [TodoSchema],
    extensions: [Migrator],
    migrations: { path: migrationsPath, snapshotName: ".snapshot", generator: D1MigrationGenerator },
});
