import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { drizzle as drizzleD1, type DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { ListOptions } from "~/grid/fields";

import { filterWhere, sortOrderBy } from "./grid.server";
import * as d1Schema from "./schema.d1";
import * as pgSchema from "./schema.pg";
import { todoGridFields } from "./todos";

export type Todo = typeof d1Schema.todos.$inferSelect;

type TodoRepository = {
    list(userId: string, options: ListOptions<typeof todoGridFields>): Promise<{ rows: Todo[]; totalCount: number }>;
    create(userId: string, title: string): Promise<void>;
    update(userId: string, id: string, values: Partial<Pick<Todo, "title" | "done">>): Promise<void>;
    delete(userId: string, id: string): Promise<void>;
};

// Create per request: Workers don't allow sharing I/O objects (e.g. db connections) between requests
export function getTodoRepository(): TodoRepository {
    if (env.DB_DIALECT === "postgres") {
        if (!env.HYPERDRIVE) {
            throw new Error("HYPERDRIVE binding missing");
        }
        const db = drizzlePg(postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false }), { casing: "snake_case" });
        // The query builder API used below is identical for both dialects, only the TypeScript types differ
        return createTodoRepository(db as unknown as DrizzleD1Database, pgSchema.todos as unknown as typeof d1Schema.todos);
    }

    if (!env.DB) {
        throw new Error("DB binding missing");
    }
    return createTodoRepository(drizzleD1(env.DB, { casing: "snake_case" }), d1Schema.todos);
}

function createTodoRepository(db: DrizzleD1Database, todos: typeof d1Schema.todos): TodoRepository {
    return {
        list: async (userId, { offset, limit, sort, filter }) => {
            const where = and(eq(todos.userId, userId), filterWhere(todos, todoGridFields, filter));
            const orderBy = sortOrderBy(todos, todoGridFields, sort);
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
