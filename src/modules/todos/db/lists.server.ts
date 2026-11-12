import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "~/db/db.server";
import type { OperationContext } from "~/operations";

import { lists, todos } from "./schema";
import { todoHistory } from "./todoHistory.server";

export type List = typeof lists.$inferSelect;

export type ListWithCount = List & { openCount: number };

type ListRepository = {
    list(userId: string): Promise<ListWithCount[]>;
    get(userId: string, id: string): Promise<List | undefined>;
    // The user's first list, created if the user has none
    getOrCreateDefault(userId: string): Promise<List>;
    create(userId: string, name: string): Promise<List>;
    // The renamed list; undefined if it doesn't exist (or belongs to another user)
    rename(userId: string, id: string, name: string): Promise<List | undefined>;
    // Deletes the list's todos too (ON DELETE CASCADE), recorded in their history (ctx: the user and where the list is deleted).
    // The deleted list; undefined if it doesn't exist (or belongs to another user)
    delete(ctx: OperationContext, id: string): Promise<List | undefined>;
};

export function getListRepository(): ListRepository {
    const db = getDb();
    const repository: ListRepository = {
        list: async (userId) => {
            return db
                .select({
                    id: lists.id,
                    userId: lists.userId,
                    name: lists.name,
                    createdAt: lists.createdAt,
                    openCount: sql<number>`count(case when ${todos.done} = 0 then 1 end)`,
                })
                .from(lists)
                .leftJoin(todos, eq(todos.listId, lists.id))
                .where(eq(lists.userId, userId))
                .groupBy(lists.id)
                .orderBy(asc(lists.createdAt), asc(lists.id));
        },
        get: async (userId, id) => {
            return db
                .select()
                .from(lists)
                .where(and(eq(lists.id, id), eq(lists.userId, userId)))
                .get();
        },
        getOrCreateDefault: async (userId) => {
            const first = await db.select().from(lists).where(eq(lists.userId, userId)).orderBy(asc(lists.createdAt), asc(lists.id)).limit(1).get();
            return first ?? repository.create(userId, "Todos");
        },
        create: async (userId, name) => {
            const [list] = await db.insert(lists).values({ userId, name }).returning();
            return list;
        },
        rename: async (userId, id, name) => {
            const [list] = await db
                .update(lists)
                .set({ name })
                .where(and(eq(lists.id, id), eq(lists.userId, userId)))
                .returning();
            return list;
        },
        delete: async (ctx, id) => {
            const deleteList = db
                .delete(lists)
                .where(and(eq(lists.id, id), eq(lists.userId, ctx.userId)))
                .returning();
            // the todos deleted with the list, with their last values for the history (a todo added in between isn't recorded as deleted:
            // D1 has no transactions across requests)
            const listTodos = await db
                .select()
                .from(todos)
                .where(and(eq(todos.listId, id), eq(todos.userId, ctx.userId)));
            const entries = todoHistory.deletedAll(ctx, listTodos);
            // a batch is atomic: the todos aren't deleted without their history entries
            const [[list]] = entries ? await db.batch([deleteList, entries]) : [await deleteList];
            return list;
        },
    };
    return repository;
}
