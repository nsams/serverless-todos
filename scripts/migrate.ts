// Migrations are written once in TypeScript (migrations/*.ts) with the Kysely schema builder:
// - D1: `generate-d1` compiles them to SQL files in migrations/d1, which wrangler applies (`wrangler d1 migrations apply`)
// - PostgreSQL: `migrate-pg` runs them with the Kysely Migrator against DATABASE_URL
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import {
    type ColumnDataType,
    type CompiledQuery,
    type DatabaseConnection,
    type Dialect,
    DummyDriver,
    Kysely,
    PostgresDialect,
    type QueryResult,
    SqliteAdapter,
    SqliteIntrospector,
    SqliteQueryCompiler,
} from "kysely";
import { type Migration, Migrator } from "kysely/migration";
import { Pool } from "pg";

export type MigrationContext = {
    dialect: "sqlite" | "postgres";
    // Column types that differ between the dialects. SQLite stores booleans as 0/1 and timestamps as epoch milliseconds.
    types: { uuid: ColumnDataType; boolean: ColumnDataType; timestamp: ColumnDataType };
};

type MigrationModule = { up(db: Kysely<unknown>, context: MigrationContext): Promise<void> };

const migrationsDir = join(import.meta.dirname, "../migrations");
const d1MigrationsDir = join(migrationsDir, "d1");

const contexts: Record<MigrationContext["dialect"], MigrationContext> = {
    sqlite: { dialect: "sqlite", types: { uuid: "text", boolean: "integer", timestamp: "integer" } },
    postgres: { dialect: "postgres", types: { uuid: "uuid", boolean: "boolean", timestamp: "timestamptz" } },
};

async function loadMigrations(): Promise<{ name: string; module: MigrationModule }[]> {
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".ts")).sort();
    return Promise.all(
        files.map(async (file) => ({
            name: basename(file, ".ts"),
            module: (await import(pathToFileURL(join(migrationsDir, file)).href)) as MigrationModule,
        })),
    );
}

async function generateD1() {
    await mkdir(d1MigrationsDir, { recursive: true });
    for (const { name, module } of await loadMigrations()) {
        const statements: string[] = [];
        const connection: DatabaseConnection = {
            async executeQuery<R>({ sql, parameters }: CompiledQuery): Promise<QueryResult<R>> {
                if (parameters.length > 0) {
                    throw new Error(`Migration ${name}: parameters can't be written to SQL files, use sql.lit() instead:\n${sql}`);
                }
                statements.push(`${sql};`);
                return { rows: [] };
            },
            // eslint-disable-next-line require-yield
            async *streamQuery() {
                throw new Error("not supported");
            },
        };
        const dialect: Dialect = {
            createAdapter: () => new SqliteAdapter(),
            createDriver: () => Object.assign(new DummyDriver(), { acquireConnection: async () => connection }),
            createIntrospector: (db) => new SqliteIntrospector(db),
            createQueryCompiler: () => new SqliteQueryCompiler(),
        };
        await module.up(new Kysely<unknown>({ dialect }), contexts.sqlite);
        const file = join(d1MigrationsDir, `${name}.sql`);
        await writeFile(file, `-- Generated from migrations/${name}.ts by \`pnpm db:generate\`, do not edit\n${statements.join("\n")}\n`);
        console.info(`wrote ${file}`);
    }
}

async function migratePg() {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL missing");
    }
    const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }) });
    try {
        const migrations = await loadMigrations();
        const migrator = new Migrator({
            db,
            provider: {
                getMigrations: async () =>
                    Object.fromEntries(
                        migrations.map(({ name, module }): [string, Migration] => [name, { up: (db) => module.up(db, contexts.postgres) }]),
                    ),
            },
        });
        const { error, results = [] } = await migrator.migrateToLatest();
        for (const result of results) {
            console.info(`${result.migrationName}: ${result.status}`);
        }
        if (results.length === 0 && !error) {
            console.info("no pending migrations");
        }
        if (error) {
            throw error;
        }
    } finally {
        await db.destroy();
    }
}

const command = process.argv[2];
if (command === "generate-d1") {
    await generateD1();
} else if (command === "migrate-pg") {
    await migratePg();
} else {
    throw new Error("usage: node scripts/migrate.ts generate-d1|migrate-pg");
}
