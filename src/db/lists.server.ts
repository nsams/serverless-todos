import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "./db.server";
import { lists, todos } from "./schema";

export type List = typeof lists.$inferSelect;

export type ListWithCount = List & { openCount: number };

type ListRepository = {
    list(userId: string): Promise<ListWithCount[]>;
    get(userId: string, id: string): Promise<List | undefined>;
    // The user's first list, created if the user has none
    getOrCreateDefault(userId: string): Promise<List>;
    create(userId: string, name: string): Promise<List>;
    // undefined if the list doesn't exist (or belongs to another user)
    rename(userId: string, id: string, name: string): Promise<List | undefined>;
    // Deletes the list's todos too (ON DELETE CASCADE). false if the list doesn't exist (or belongs to another user)
    delete(userId: string, id: string): Promise<boolean>;
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
            return db
                .update(lists)
                .set({ name })
                .where(and(eq(lists.id, id), eq(lists.userId, userId)))
                .returning()
                .get();
        },
        delete: async (userId, id) => {
            const deleted = await db
                .delete(lists)
                .where(and(eq(lists.id, id), eq(lists.userId, userId)))
                .returning({ id: lists.id });
            return deleted.length > 0;
        },
    };
    return repository;
}
