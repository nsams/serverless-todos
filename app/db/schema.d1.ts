import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const todos = sqliteTable("todos", {
    id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    userId: text().notNull(),
    title: text().notNull(),
    done: integer({ mode: "boolean" }).notNull().default(false),
    createdAt: integer({ mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date()),
});
