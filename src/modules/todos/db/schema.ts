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

// The fields of a todo whose changes are recorded in its history
export type TodoHistoryValues = {
    title: string;
    description: string;
    dueDate: string | null;
    done: boolean;
    listId: string;
};

// The changed fields of a history entry: old and new value. A "created" entry has the todo's initial values (no `from`).
export type TodoFieldChanges = { [Field in keyof TodoHistoryValues]?: { from?: TodoHistoryValues[Field]; to: TodoHistoryValues[Field] } };

// The history of a todo: one entry per creation and per change (written together with the change, see todos.server.ts).
// Deleted with the todo (and so with its list).
export const todoHistory = sqliteTable(
    "todo_history",
    {
        // ascending: the order of the entries, also within the same millisecond
        id: integer().primaryKey({ autoIncrement: true }),
        userId: text().notNull(),
        todoId: text()
            .notNull()
            .references(() => todos.id, { onDelete: "cascade" }),
        action: text({ enum: ["created", "updated"] }).notNull(),
        // where the change was made (OperationSource in src/operations.ts); null: unknown (todos created before the history existed)
        source: text({ enum: ["app", "chat", "mcp"] }),
        changes: text({ mode: "json" }).$type<TodoFieldChanges>().notNull(),
        createdAt: integer({ mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => [index("todo_history_todo_id_idx").on(table.todoId)],
);
