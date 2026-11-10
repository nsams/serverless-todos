import { and, desc, eq, lte, max } from "drizzle-orm";

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
        // Adds the message at the end of the conversation, or updates it (keeping its position) if it is already there
        save: async (userId: string, message: ChatMessage) => {
            const [last] = await db
                .select({ position: max(chatMessages.position) })
                .from(chatMessages)
                .where(eq(chatMessages.userId, userId));
            const position = (last?.position ?? -1) + 1;
            await db
                .insert(chatMessages)
                .values({ userId, id: message.id, position, message })
                .onConflictDoUpdate({ target: [chatMessages.userId, chatMessages.id], set: { message } });
            // older messages beyond the limit
            await db.delete(chatMessages).where(and(eq(chatMessages.userId, userId), lte(chatMessages.position, position - maxMessages)));
        },
        clear: async (userId: string) => {
            await db.delete(chatMessages).where(eq(chatMessages.userId, userId));
        },
    };
}
