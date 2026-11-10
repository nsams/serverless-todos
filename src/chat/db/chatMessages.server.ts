import { and, desc, eq, lte, sql } from "drizzle-orm";

import { getDb } from "~/db/db.server";

import type { ChatMessage } from "../chat";
import { chatMessages } from "./schema";

// The chat history of a user: the last maxMessages messages are kept
const maxMessages = 200;

export type StoredChatMessage = { message: ChatMessage; position: number };

export function getChatMessageRepository() {
    const db = getDb();
    return {
        // in the order of the conversation
        list: async (userId: string): Promise<StoredChatMessage[]> => {
            const rows = await db
                .select({ message: chatMessages.message, position: chatMessages.position })
                .from(chatMessages)
                .where(eq(chatMessages.userId, userId))
                .orderBy(desc(chatMessages.position))
                .limit(maxMessages);
            return rows.reverse().map(({ message, position }) => ({ message: message as ChatMessage, position }));
        },
        // Adds the message at the end of the conversation, or updates it (keeping its position) if it is already there.
        // Two queries (on bunny.net every query is a subrequest, which are limited per request).
        save: async (userId: string, message: ChatMessage) => {
            const userMessages = eq(chatMessages.userId, userId);
            const nextPosition = sql<number>`(select coalesce(max(${chatMessages.position}), -1) + 1 from ${chatMessages} where ${userMessages})`;
            await db
                .insert(chatMessages)
                .values({ userId, id: message.id, position: nextPosition, message })
                .onConflictDoUpdate({ target: [chatMessages.userId, chatMessages.id], set: { message } });
            // older messages beyond the limit
            const oldestKept = sql`(select max(${chatMessages.position}) - ${maxMessages} from ${chatMessages} where ${userMessages})`;
            await db.delete(chatMessages).where(and(userMessages, lte(chatMessages.position, oldestKept)));
        },
        clear: async (userId: string) => {
            await db.delete(chatMessages).where(eq(chatMessages.userId, userId));
        },
    };
}
