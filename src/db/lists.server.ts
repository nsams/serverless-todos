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
    rename(userId: string, id: string, name: string): Promise<void>;
    // Deletes the list's todos too (ON DELETE CASCADE)
    delete(userId: string, id: string): Promise<void>;
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
            const firstList = () => db.select().from(lists).where(eq(lists.userId, userId)).orderBy(asc(lists.createdAt), asc(lists.id)).limit(1);
            const first = await firstList().get();
            if (first) {
                return first;
            }
            // Insert only if there is still no list: concurrent requests of a new user (e.g. two tabs) would create two lists otherwise.
            // A single statement is atomic in D1.
            await db.run(sql`
                insert into ${lists} (id, user_id, name, created_at)
                select ${crypto.randomUUID()}, ${userId}, 'Todos', ${Date.now()}
                where not exists (select 1 from ${lists} where user_id = ${userId})
            `);
            const created = await firstList().get();
            if (!created) {
                throw new Error("Default list was not created");
            }
            return created;
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
