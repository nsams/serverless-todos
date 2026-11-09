import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const notebooks = sqliteTable(
    "notebooks",
    {
        id: text()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        userId: text().notNull(),
        name: text().notNull(),
        createdAt: integer({ mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => [index("notebooks_user_id_idx").on(table.userId)],
);

export const notes = sqliteTable(
    "notes",
    {
        id: text()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        // redundant to the notebook's user, but every query is scoped by user anyway (and the search spans all notebooks)
        userId: text().notNull(),
        notebookId: text()
            .notNull()
            .references(() => notebooks.id, { onDelete: "cascade" }),
        title: text().notNull(),
        // Markdown
        body: text().notNull().default(""),
        createdAt: integer({ mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer({ mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => [index("notes_notebook_id_idx").on(table.notebookId), index("notes_user_id_idx").on(table.userId)],
);
