import { type Expression, type ExpressionBuilder, type Selectable, sql, type SqlBool } from "kysely";

import { type Database, getDb } from "./db.server";

export type Todo = { id: string; userId: string; title: string; done: boolean; createdAt: Date };

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

type TodoExpressionBuilder = ExpressionBuilder<Database, "todos">;

// Create per request: Workers don't allow sharing I/O objects (e.g. db connections) between requests
export function getTodoRepository(): TodoRepository {
    const db = getDb();

    return {
        list: async (userId, { offset, limit, sort, filter }) => {
            const where = (eb: TodoExpressionBuilder) => {
                const conditions: Expression<SqlBool>[] = [eb("userId", "=", userId)];
                if (filter.items.length > 0) {
                    const filterConditions = filter.items.map((item) => filterCondition(eb, item));
                    conditions.push(filter.logicOperator === "or" ? eb.or(filterConditions) : eb.and(filterConditions));
                }
                return eb.and(conditions);
            };

            let rowsQuery = db.selectFrom("todos").selectAll().where(where);
            for (const { field, direction } of sort) {
                // case-insensitive in both dialects (SQLite compares binary by default)
                rowsQuery = rowsQuery.orderBy(field === "title" ? sql`lower(${sql.ref("title")})` : field, direction);
            }
            rowsQuery = rowsQuery.orderBy("createdAt", "desc").orderBy("id", "desc").limit(limit).offset(offset);

            const [rows, { count }] = await Promise.all([
                rowsQuery.execute(),
                db
                    .selectFrom("todos")
                    .select((eb) => eb.fn.countAll().as("count"))
                    .where(where)
                    .executeTakeFirstOrThrow(),
            ]);
            // count is a string in PostgreSQL (bigint) and a number in D1
            return { rows: rows.map(toTodo), totalCount: Number(count) };
        },
        create: async (userId, title) => {
            await db.insertInto("todos").values({ id: crypto.randomUUID(), userId, title, createdAt: new Date() }).execute();
        },
        update: async (userId, id, values) => {
            await db.updateTable("todos").set(values).where("id", "=", id).where("userId", "=", userId).execute();
        },
        delete: async (userId, id) => {
            await db.deleteFrom("todos").where("id", "=", id).where("userId", "=", userId).execute();
        },
    };
}

function toTodo(row: Selectable<Database["todos"]>): Todo {
    return { ...row, done: Boolean(row.done), createdAt: new Date(row.createdAt) };
}

function filterCondition(eb: TodoExpressionBuilder, filter: TodoFilter): Expression<SqlBool> {
    switch (filter.field) {
        case "title": {
            // case-insensitive in both dialects (no ILIKE in SQLite), wildcards in the value are matched literally
            const value = filter.value.toLowerCase().replace(/[\\%_]/g, "\\$&");
            const pattern = { contains: `%${value}%`, equals: value, startsWith: `${value}%`, endsWith: `%${value}` }[filter.operator];
            return sql<SqlBool>`lower(${eb.ref("title")}) like ${pattern} escape '\\'`;
        }
        case "done":
            return eb("done", "=", filter.value);
        case "createdAt": {
            // minute precision, like the DataGrid's dateTime filter
            const minute = new Date(filter.value);
            minute.setSeconds(0, 0);
            const nextMinute = new Date(minute.getTime() + 60_000);
            return {
                after: () => eb("createdAt", ">=", nextMinute),
                onOrAfter: () => eb("createdAt", ">=", minute),
                before: () => eb("createdAt", "<", minute),
                onOrBefore: () => eb("createdAt", "<", nextMinute),
            }[filter.operator]();
        }
    }
}
