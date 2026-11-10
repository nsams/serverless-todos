import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The chat history of every user (src/chat/db/chatMessages.server.ts): one row per message (AI SDK UI message as JSON)
export const chatMessages = sqliteTable(
    "chat_messages",
    {
        userId: text().notNull(),
        // the id of the UI message (from the client or the model's stream): unique per user only, so it is part of the key
        id: text().notNull(),
        // order in the conversation; kept when a message is updated (e.g. a tool approval)
        position: integer().notNull(),
        message: text({ mode: "json" }).notNull(),
    },
    (table) => [primaryKey({ columns: [table.userId, table.id] }), index("chat_messages_user_id_position_idx").on(table.userId, table.position)],
);
