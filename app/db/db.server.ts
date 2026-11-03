import { env } from "cloudflare:workers";
import { CamelCasePlugin, type ColumnType, Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import { D1Dialect } from "./d1-dialect";

// One schema type for both dialects. Tables are created by the migrations in /migrations.
// Selected values reflect the raw driver output: D1 (SQLite) returns booleans as 0/1 and dates as epoch milliseconds,
// PostgreSQL returns boolean and Date. Repositories normalize rows before returning them.
export interface Database {
    todos: TodoTable;
}

interface TodoTable {
    id: string;
    userId: string;
    title: string;
    done: ColumnType<boolean | number, boolean | undefined, boolean>;
    createdAt: ColumnType<Date | number, Date, never>;
}

// Create per request: Workers don't allow sharing I/O objects (e.g. db connections) between requests
export function getDb(): Kysely<Database> {
    const plugins = [new CamelCasePlugin()];

    if (env.DB_DIALECT === "postgres") {
        if (!env.HYPERDRIVE) {
            throw new Error("HYPERDRIVE binding missing");
        }
        return new Kysely<Database>({
            dialect: new PostgresDialect({ pool: new Pool({ connectionString: env.HYPERDRIVE.connectionString, max: 5 }) }),
            plugins,
        });
    }

    if (!env.DB) {
        throw new Error("DB binding missing");
    }
    return new Kysely<Database>({ dialect: new D1Dialect(env.DB), plugins });
}
