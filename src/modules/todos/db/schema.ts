import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const lists = sqliteTable(
    "lists",
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
    (table) => [index("lists_user_id_idx").on(table.userId)],
);

export const todos = sqliteTable(
    "todos",
    {
        id: text()
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        // redundant to the list's user, but every query is scoped by user anyway
        userId: text().notNull(),
        listId: text()
            .notNull()
            .references(() => lists.id, { onDelete: "cascade" }),
        title: text().notNull(),
        description: text().notNull().default(""),
        // calendar date (YYYY-MM-DD) without time zone: whether a todo is overdue depends on the user's local date
        dueDate: text(),
        done: integer({ mode: "boolean" }).notNull().default(false),
        createdAt: integer({ mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => [index("todos_list_id_idx").on(table.listId)],
);
