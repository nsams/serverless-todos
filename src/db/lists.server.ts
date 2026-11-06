import { env } from "cloudflare:workers";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { seedFixtures } from "./fixtures.server";
import { lists, todos } from "./schema";

export type List = typeof lists.$inferSelect;

export type ListWithCount = List & { openCount: number };

type ListRepository = {
    list(userId: string): Promise<ListWithCount[]>;
    get(userId: string, id: string): Promise<List | undefined>;
    // The user's first list, created if the user has none (or sample data, see fixtures.server.ts)
    getOrCreateDefault(userId: string): Promise<List>;
    create(userId: string, name: string): Promise<List>;
    rename(userId: string, id: string, name: string): Promise<void>;
    // Deletes the list's todos too (ON DELETE CASCADE)
    delete(userId: string, id: string): Promise<void>;
};

// Cheap to create: the D1 binding is just a handle, no connection pool to manage
export function getListRepository(): ListRepository {
    const db = drizzle(env.DB, { casing: "snake_case" });
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
            const getFirst = () =>
                db.select().from(lists).where(eq(lists.userId, userId)).orderBy(asc(lists.createdAt), asc(lists.id)).limit(1).get();
            let first = await getFirst();
            if (!first && env.SEED_FIXTURES === "true") {
                await seedFixtures(db, userId);
                first = await getFirst();
            }
            return first ?? repository.create(userId, "Todos");
        },
        create: async (userId, name) => {
            const [list] = await db.insert(lists).values({ userId, name }).returning();
            return list;
        },
        rename: async (userId, id, name) => {
            await db
                .update(lists)
                .set({ name })
                .where(and(eq(lists.id, id), eq(lists.userId, userId)));
        },
        delete: async (userId, id) => {
            await db.delete(lists).where(and(eq(lists.id, id), eq(lists.userId, userId)));
        },
    };
    return repository;
}
