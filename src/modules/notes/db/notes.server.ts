import { and, desc, eq, or, type SQL, sql } from "drizzle-orm";

import { getDb } from "~/db/db.server";

import { getNotebookRepository } from "./notebooks.server";
import { notes } from "./schema";

export type Note = typeof notes.$inferSelect;

// A note without its body (lists, search results), with the beginning of the body as excerpt
export type NoteSummary = Pick<Note, "id" | "notebookId" | "title" | "updatedAt"> & { excerpt: string };

export type NoteValues = Pick<Note, "title" | "body">;

const excerptLength = 200;

// notebookId: only notes of this notebook; query: only notes whose title or body contains it (case-insensitive)
type SearchOptions = { notebookId?: string; query?: string; limit: number };

type NoteRepository = {
    // most recently changed first
    search(userId: string, options: SearchOptions): Promise<NoteSummary[]>;
    get(userId: string, id: string): Promise<Note | undefined>;
    // undefined if the notebook doesn't exist (or belongs to another user)
    create(userId: string, notebookId: string, values: NoteValues): Promise<Note | undefined>;
    // The new updatedAt; undefined if the note or the target notebook doesn't exist (or belongs to another user)
    update(userId: string, id: string, values: Partial<NoteValues & Pick<Note, "notebookId">>): Promise<Date | undefined>;
    // Appends text to the body as a new paragraph, without reading and re-sending the whole body
    append(userId: string, id: string, text: string): Promise<void>;
    delete(userId: string, id: string): Promise<void>;
};

export function getNoteRepository(): NoteRepository {
    const db = getDb();
    const notebookExists = async (userId: string, notebookId: string) => (await getNotebookRepository().get(userId, notebookId)) !== undefined;
    return {
        search: async (userId, { notebookId, query, limit }) => {
            return db
                .select({
                    id: notes.id,
                    notebookId: notes.notebookId,
                    title: notes.title,
                    updatedAt: notes.updatedAt,
                    excerpt: sql<string>`substr(${notes.body}, 1, ${excerptLength})`,
                })
                .from(notes)
                .where(
                    and(
                        eq(notes.userId, userId),
                        notebookId !== undefined ? eq(notes.notebookId, notebookId) : undefined,
                        query ? or(containsCondition(notes.title, query), containsCondition(notes.body, query)) : undefined,
                    ),
                )
                .orderBy(desc(notes.updatedAt), desc(notes.id))
                .limit(limit);
        },
        get: async (userId, id) => {
            return db
                .select()
                .from(notes)
                .where(and(eq(notes.id, id), eq(notes.userId, userId)))
                .get();
        },
        create: async (userId, notebookId, values) => {
            if (!(await notebookExists(userId, notebookId))) {
                return undefined;
            }
            const [note] = await db
                .insert(notes)
                .values({ userId, notebookId, ...values })
                .returning();
            return note;
        },
        update: async (userId, id, values) => {
            if (values.notebookId !== undefined && !(await notebookExists(userId, values.notebookId))) {
                return undefined;
            }
            const [updated] = await db
                .update(notes)
                .set({ ...values, updatedAt: new Date() })
                .where(and(eq(notes.id, id), eq(notes.userId, userId)))
                .returning({ updatedAt: notes.updatedAt });
            return updated?.updatedAt;
        },
        append: async (userId, id, text) => {
            await db
                .update(notes)
                .set({
                    // separated by an empty line (a new Markdown paragraph), unless the body is empty
                    body: sql`case when ${notes.body} = '' then ${text} else rtrim(${notes.body}, char(10)) || char(10) || char(10) || ${text} end`,
                    updatedAt: new Date(),
                })
                .where(and(eq(notes.id, id), eq(notes.userId, userId)));
        },
        delete: async (userId, id) => {
            await db.delete(notes).where(and(eq(notes.id, id), eq(notes.userId, userId)));
        },
    };
}

// Case-insensitive substring match (no ILIKE in SQLite), wildcards in the value are matched literally
function containsCondition(column: typeof notes.title | typeof notes.body, value: string): SQL {
    const pattern = `%${value.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
    return sql`lower(${column}) like ${pattern} escape '\\'`;
}
