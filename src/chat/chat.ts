import type { UIMessage } from "ai";
import { z } from "zod";

import { dateStringSchema } from "~/dates";

import { chatPageSchema } from "./chatPage";

// Shared by the chat endpoint (server) and the chat panel (client)

// The endpoint the chat panel sends its messages to (src/chat/chat.server.ts), the answer is streamed back (AI SDK UI message stream)
export const chatPath = "/api/chat";

// Sent by the client with every chat message. The history is kept by the server (src/chat/db/), so the client sends only the new
// message: the user's message, or the assistant's last message with the user's tool approvals.
export const chatRequestBodySchema = z.object({
    // validated with the AI SDK's validateUIMessages
    message: z.unknown(),
    // the user's local date (YYYY-MM-DD), for relative dates like "tomorrow": the server doesn't know the user's time zone
    today: dateStringSchema.optional(),
    // the page shown, reported by the page with useChatPage (src/chat/chatPage.ts)
    page: chatPageSchema.optional(),
});

export type ChatRequestBody = z.infer<typeof chatRequestBodySchema>;

// Data parts the assistant adds to its answers
export type ChatDataParts = {
    // after a tool changed data (an operation with effect write or delete): the ids of the modules whose data changed, so the client
    // reloads exactly their data (useChatChanges). Part of the persisted message (not transient).
    changes: { modules: string[] };
};

export const chatDataPartSchemas = {
    changes: z.object({ modules: z.array(z.string()) }),
};

export type ChatMessage = UIMessage<unknown, ChatDataParts>;
