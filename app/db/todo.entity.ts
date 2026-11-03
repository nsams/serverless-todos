import { defineEntity, type InferEntity, p } from "@mikro-orm/core";

// Shared by both dialects: SQLite (D1) stores uuid as text, boolean as integer and datetime as unix milliseconds
export const TodoSchema = defineEntity({
    name: "Todo",
    tableName: "todos",
    properties: {
        id: p
            .uuid()
            .primary()
            .onCreate(() => crypto.randomUUID()),
        userId: p.text(),
        title: p.text(),
        done: p.boolean().default(false),
        createdAt: p.datetime().onCreate(() => new Date()),
    },
});

export type Todo = InferEntity<typeof TodoSchema>;
