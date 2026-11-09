import { and, asc, count, eq } from "drizzle-orm";

import { getDb } from "~/db/db.server";

import { notebooks, notes } from "./schema";

export type Notebook = typeof notebooks.$inferSelect;

export type NotebookWithCount = Notebook & { noteCount: number };

type NotebookRepository = {
    list(userId: string): Promise<NotebookWithCount[]>;
    get(userId: string, id: string): Promise<Notebook | undefined>;
    // The user's first notebook, created if the user has none
    getOrCreateDefault(userId: string): Promise<Notebook>;
    create(userId: string, name: string): Promise<Notebook>;
    rename(userId: string, id: string, name: string): Promise<void>;
    // Deletes the notebook's notes too (ON DELETE CASCADE)
    delete(userId: string, id: string): Promise<void>;
};

export function getNotebookRepository(): NotebookRepository {
    const db = getDb();
    const repository: NotebookRepository = {
        list: async (userId) => {
            return db
                .select({
                    id: notebooks.id,
                    userId: notebooks.userId,
                    name: notebooks.name,
                    createdAt: notebooks.createdAt,
                    noteCount: count(notes.id),
                })
                .from(notebooks)
                .leftJoin(notes, eq(notes.notebookId, notebooks.id))
                .where(eq(notebooks.userId, userId))
                .groupBy(notebooks.id)
                .orderBy(asc(notebooks.createdAt), asc(notebooks.id));
        },
        get: async (userId, id) => {
            return db
                .select()
                .from(notebooks)
                .where(and(eq(notebooks.id, id), eq(notebooks.userId, userId)))
                .get();
        },
        getOrCreateDefault: async (userId) => {
            const first = await db
                .select()
                .from(notebooks)
                .where(eq(notebooks.userId, userId))
                .orderBy(asc(notebooks.createdAt), asc(notebooks.id))
                .limit(1)
                .get();
            return first ?? repository.create(userId, "Notes");
        },
        create: async (userId, name) => {
            const [notebook] = await db.insert(notebooks).values({ userId, name }).returning();
            return notebook;
        },
        rename: async (userId, id, name) => {
            await db
                .update(notebooks)
                .set({ name })
                .where(and(eq(notebooks.id, id), eq(notebooks.userId, userId)));
        },
        delete: async (userId, id) => {
            await db.delete(notebooks).where(and(eq(notebooks.id, id), eq(notebooks.userId, userId)));
        },
    };
    return repository;
}
