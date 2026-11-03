import {
    type CompiledQuery,
    type DatabaseConnection,
    type DatabaseIntrospector,
    type Dialect,
    type DialectAdapter,
    type Driver,
    type Kysely,
    type QueryCompiler,
    type QueryResult,
    SqliteAdapter,
    SqliteIntrospector,
    SqliteQueryCompiler,
} from "kysely";

/**
 * Minimal Kysely dialect for Cloudflare D1 (SQLite).
 *
 * Parameters are converted to what D1 can bind: dates are stored as epoch milliseconds and booleans as 0/1.
 * D1 has no interactive transactions, so `db.transaction()` throws.
 */
export class D1Dialect implements Dialect {
    readonly #database: D1Database;

    constructor(database: D1Database) {
        this.#database = database;
    }

    createAdapter(): DialectAdapter {
        return new SqliteAdapter();
    }

    createDriver(): Driver {
        return new D1Driver(this.#database);
    }

    createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
        return new SqliteIntrospector(db);
    }

    createQueryCompiler(): QueryCompiler {
        return new SqliteQueryCompiler();
    }
}

class D1Driver implements Driver {
    readonly #connection: D1Connection;

    constructor(database: D1Database) {
        this.#connection = new D1Connection(database);
    }

    async init() {}

    async acquireConnection() {
        return this.#connection;
    }

    async releaseConnection() {}

    async beginTransaction(): Promise<never> {
        throw new Error("D1 does not support transactions, use db.batch() on the D1 binding instead");
    }

    async commitTransaction(): Promise<never> {
        throw new Error("D1 does not support transactions");
    }

    async rollbackTransaction(): Promise<never> {
        throw new Error("D1 does not support transactions");
    }

    async destroy() {}
}

class D1Connection implements DatabaseConnection {
    readonly #database: D1Database;

    constructor(database: D1Database) {
        this.#database = database;
    }

    async executeQuery<R>({ sql, parameters }: CompiledQuery): Promise<QueryResult<R>> {
        const result = await this.#database
            .prepare(sql)
            .bind(...parameters.map(toD1Value))
            .run<R>();
        return {
            rows: result.results,
            numAffectedRows: BigInt(result.meta.changes),
            insertId: result.meta.last_row_id ? BigInt(result.meta.last_row_id) : undefined,
        };
    }

    // eslint-disable-next-line require-yield
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
        throw new Error("D1 does not support streaming");
    }
}

function toD1Value(value: unknown): unknown {
    if (value instanceof Date) {
        return value.getTime();
    }
    if (typeof value === "boolean") {
        return value ? 1 : 0;
    }
    return value ?? null;
}
