import { and, asc, desc, eq, or, sql } from "drizzle-orm";

import { getDb } from "~/db/db.server";
import { dateTimeCondition, textCondition } from "~/db/filters.server";
import type { DateTimeOperator, TextOperator } from "~/gridSearch";

import { getNotebookRepository } from "./notebooks.server";
import { notes } from "./schema";

export type Note = typeof notes.$inferSelect;

// A note without its body (grid, search results), with the beginning of the body as excerpt
export type NoteSummary = Pick<Note, "id" | "notebookId" | "title" | "createdAt" | "updatedAt"> & { excerpt: string };

export type NoteSort = { field: "title" | "body" | "createdAt" | "updatedAt"; direction: "asc" | "desc" };

type TextFilter<Field> = { field: Field; operator: TextOperator; value: string };
type DateTimeFilter<Field> = { field: Field; operator: DateTimeOperator; value: Date };

export type NoteFilter = TextFilter<"title"> | TextFilter<"body"> | DateTimeFilter<"createdAt"> | DateTimeFilter<"updatedAt">;

export type NoteFilterModel = { items: NoteFilter[]; logicOperator: "and" | "or" };

// The grid of a notebook. query: only notes whose title or body contains it (the search field next to the grid's filters)
type ListOptions = { offset: number; limit: number; sort: NoteSort[]; filter: NoteFilterModel; query?: string };

export type NoteValues = Pick<Note, "title" | "body">;

const excerptLength = 200;

// Search across the user's notebooks (used by the AI tools). notebookId: only notes of this notebook; query: only notes whose title or body contains it
type SearchOptions = { notebookId?: string; query?: string; limit: number };

type NoteRepository = {
    // sorted by sort, then most recently changed first
    list(userId: string, notebookId: string, options: ListOptions): Promise<{ rows: NoteSummary[]; totalCount: number }>;
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
        list: async (userId, notebookId, { offset, limit, sort, filter, query }) => {
            const filterConditions = filter.items.map((item) => filterCondition(item));
            const where = and(
                eq(notes.userId, userId),
                eq(notes.notebookId, notebookId),
                filter.logicOperator === "or" ? or(...filterConditions) : and(...filterConditions),
                queryCondition(query),
            );
            const orderBy = sort.map(({ field, direction }) => {
                const order = direction === "asc" ? asc : desc;
                // text case-insensitive (SQLite compares binary by default)
                return field === "title" || field === "body" ? order(sql`lower(${notes[field]})`) : order(notes[field]);
            });
            const [rows, totalCount] = await Promise.all([
                db
                    .select(summaryColumns)
                    .from(notes)
                    .where(where)
                    .orderBy(...orderBy, desc(notes.updatedAt), desc(notes.id))
                    .limit(limit)
                    .offset(offset),
                db.$count(notes, where),
            ]);
            return { rows, totalCount };
        },
        search: async (userId, { notebookId, query, limit }) => {
            return db
                .select(summaryColumns)
                .from(notes)
                .where(and(eq(notes.userId, userId), notebookId !== undefined ? eq(notes.notebookId, notebookId) : undefined, queryCondition(query)))
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

const summaryColumns = {
    id: notes.id,
    notebookId: notes.notebookId,
    title: notes.title,
    createdAt: notes.createdAt,
    updatedAt: notes.updatedAt,
    excerpt: sql<string>`substr(${notes.body}, 1, ${excerptLength})`,
};

// Title or body contains the text (case-insensitive)
function queryCondition(query: string | undefined) {
    return query ? or(textCondition(notes.title, "contains", query), textCondition(notes.body, "contains", query)) : undefined;
}

function filterCondition(filter: NoteFilter) {
    switch (filter.field) {
        case "title":
        case "body":
            return textCondition(notes[filter.field], filter.operator, filter.value);
        case "createdAt":
        case "updatedAt":
            return dateTimeCondition(notes[filter.field], filter.operator, filter.value);
    }
}
