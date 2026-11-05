import { env } from "cloudflare:workers";
import { and, asc, desc, eq, gte, lt, or, type SQL, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { todos } from "./schema";

export type Todo = typeof todos.$inferSelect;

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

// Cheap to create: the D1 binding is just a handle, no connection pool to manage
export function getTodoRepository(): TodoRepository {
    const db = drizzle(env.DB, { casing: "snake_case" });
    return {
        list: async (userId, { offset, limit, sort, filter }) => {
            const filterConditions = filter.items.map((item) => filterCondition(item));
            const where = and(eq(todos.userId, userId), filter.logicOperator === "or" ? or(...filterConditions) : and(...filterConditions));
            const orderBy = sort.map(({ field, direction }) => {
                // case-insensitive (SQLite compares binary by default)
                const column = field === "title" ? sql`lower(${todos.title})` : todos[field];
                return direction === "asc" ? asc(column) : desc(column);
            });
            const [rows, totalCount] = await Promise.all([
                db
                    .select()
                    .from(todos)
                    .where(where)
                    .orderBy(...orderBy, desc(todos.createdAt), desc(todos.id))
                    .limit(limit)
                    .offset(offset),
                db.$count(todos, where),
            ]);
            return { rows, totalCount };
        },
        create: async (userId, title) => {
            await db.insert(todos).values({ userId, title });
        },
        update: async (userId, id, values) => {
            await db
                .update(todos)
                .set(values)
                .where(and(eq(todos.id, id), eq(todos.userId, userId)));
        },
        delete: async (userId, id) => {
            await db.delete(todos).where(and(eq(todos.id, id), eq(todos.userId, userId)));
        },
    };
}

function filterCondition(filter: TodoFilter): SQL | undefined {
    switch (filter.field) {
        case "title": {
            // case-insensitive (no ILIKE in SQLite), wildcards in the value are matched literally
            const value = filter.value.toLowerCase().replace(/[\\%_]/g, "\\$&");
            const pattern = { contains: `%${value}%`, equals: value, startsWith: `${value}%`, endsWith: `%${value}` }[filter.operator];
            return sql`lower(${todos.title}) like ${pattern} escape '\\'`;
        }
        case "done":
            return eq(todos.done, filter.value);
        case "createdAt": {
            // minute precision, like the DataGrid's dateTime filter
            const minute = new Date(filter.value);
            minute.setSeconds(0, 0);
            const nextMinute = new Date(minute.getTime() + 60_000);
            return {
                after: gte(todos.createdAt, nextMinute),
                onOrAfter: gte(todos.createdAt, minute),
                before: lt(todos.createdAt, minute),
                onOrBefore: lt(todos.createdAt, nextMinute),
            }[filter.operator];
        }
    }
}
