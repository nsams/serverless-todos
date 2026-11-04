import { MikroORM as PostgreSqlMikroORM } from "@mikro-orm/postgresql";
import { type EntityManager, type FilterQuery, MikroORM, type QueryOrderMap, raw, SqliteDriver, wrap } from "@mikro-orm/sql";
import { env } from "cloudflare:workers";
import { D1Dialect } from "kysely-d1";

import compiledFunctionsD1 from "./compiled-functions.d1.js";
import compiledFunctionsPg from "./compiled-functions.pg.js";
import { type Todo as TodoEntity, TodoSchema } from "./todo.entity";

export type Todo = Pick<TodoEntity, "id" | "userId" | "title" | "done" | "createdAt">;

export type TodoSort = { field: "title" | "done" | "createdAt"; direction: "asc" | "desc" };

export type TodoFilter =
    | { field: "title"; operator: "contains" | "equals" | "startsWith" | "endsWith"; value: string }
    | { field: "done"; operator: "is"; value: boolean }
    | { field: "createdAt"; operator: "after" | "onOrAfter" | "before" | "onOrBefore"; value: Date };

export type TodoFilterModel = { items: TodoFilter[]; logicOperator: "and" | "or" };

type ListOptions = { offset: number; limit: number; sort: TodoSort[]; filter: TodoFilterModel };

type TodoRepository = {
    list(userId: string, options: ListOptions): Promise<{ rows: Todo[]; totalCount: number }>;
    create(userId: string, title: string): Promise<void>;
    update(userId: string, id: string, values: Partial<Pick<Todo, "title" | "done">>): Promise<void>;
    delete(userId: string, id: string): Promise<void>;
};

// compiledFunctions: Workers don't allow `new Function()`, which MikroORM uses for hydration etc. by default.
// Pre-compiled with `npm run orm:compile` (part of typegen and build), must be regenerated after changing entities.
const ormOptions = {
    entities: [TodoSchema],
    // the schema is managed by migrations, skip the "does the database exist" query on every connect (= request)
    ensureDatabase: false,
    debug: import.meta.env.DEV,
};

// Create per request: Workers don't allow sharing I/O objects (e.g. db connections) between requests
export function getTodoRepository(): TodoRepository {
    if (env.DB_DIALECT === "postgres") {
        if (!env.HYPERDRIVE) {
            throw new Error("HYPERDRIVE binding missing");
        }
        const orm = new PostgreSqlMikroORM({
            ...ormOptions,
            clientUrl: env.HYPERDRIVE.connectionString,
            pool: { max: 5 },
            compiledFunctions: compiledFunctionsPg,
        });
        return createTodoRepository(orm.em.fork());
    }

    if (!env.DB) {
        throw new Error("DB binding missing");
    }
    const orm = new MikroORM({
        ...ormOptions,
        driver: SqliteDriver,
        dbName: "d1", // required by MikroORM, the database is selected by the binding
        driverOptions: new D1Dialect({ database: env.DB }),
        // D1 doesn't support BEGIN/COMMIT statements
        implicitTransactions: false,
        compiledFunctions: compiledFunctionsD1,
    });
    return createTodoRepository(orm.em.fork());
}

function createTodoRepository(em: EntityManager): TodoRepository {
    return {
        list: async (userId, { offset, limit, sort, filter }) => {
            const filterConditions = filter.items.map(filterCondition);
            const where: FilterQuery<TodoEntity> = {
                userId,
                ...(filterConditions.length > 0 && { [filter.logicOperator === "or" ? "$or" : "$and"]: filterConditions }),
            };
            const orderBy: QueryOrderMap<TodoEntity>[] = [
                ...sort.map(({ field, direction }) =>
                    // case-insensitive in both dialects (SQLite compares binary by default)
                    field === "title" ? { [raw((alias) => `lower(${alias}.title)`)]: direction } : { [field]: direction },
                ),
                { createdAt: "desc" },
                { id: "desc" },
            ];
            const [rows, totalCount] = await em.findAndCount(TodoSchema, where, { orderBy, limit, offset });
            return { rows: rows.map((row) => wrap(row).toPOJO()), totalCount };
        },
        create: async (userId, title) => {
            em.create(TodoSchema, { userId, title });
            await em.flush();
        },
        update: async (userId, id, values) => {
            await em.nativeUpdate(TodoSchema, { id, userId }, values);
        },
        delete: async (userId, id) => {
            await em.nativeDelete(TodoSchema, { id, userId });
        },
    };
}

function filterCondition(filter: TodoFilter): FilterQuery<TodoEntity> {
    switch (filter.field) {
        case "title": {
            // case-insensitive in both dialects (no ILIKE in SQLite), wildcards in the value are matched literally
            const value = filter.value.toLowerCase().replace(/[\\%_]/g, "\\$&");
            const pattern = { contains: `%${value}%`, equals: value, startsWith: `${value}%`, endsWith: `%${value}` }[filter.operator];
            return { [raw((alias) => `lower(${alias}.title) like ? escape '\\'`, [pattern])]: [] };
        }
        case "done":
            return { done: filter.value };
        case "createdAt": {
            // minute precision, like the DataGrid's dateTime filter
            const minute = new Date(filter.value);
            minute.setSeconds(0, 0);
            const nextMinute = new Date(minute.getTime() + 60_000);
            return {
                after: { createdAt: { $gte: nextMinute } },
                onOrAfter: { createdAt: { $gte: minute } },
                before: { createdAt: { $lt: minute } },
                onOrBefore: { createdAt: { $lt: nextMinute } },
            }[filter.operator];
        }
    }
}
