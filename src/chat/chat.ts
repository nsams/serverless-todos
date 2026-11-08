import { z } from "zod";

import { dateStringSchema } from "~/dates";

// Shared by the chat agent (server) and the chat panel (client)

// Path the client connects to (WebSocket and HTTP); the server picks the agent instance of the authenticated user (src/server.ts)
export const chatAgentPath = "chat-agent";

// Sent by the client with every chat message: the server doesn't know the user's local date or what they are looking at
export const chatRequestBodySchema = z.object({
    // the user's local date (YYYY-MM-DD), for relative dates like "tomorrow"
    today: dateStringSchema.optional(),
    // the list currently shown in the app, the default list for new todos
    currentListId: z.string().optional(),
});

export type ChatRequestBody = z.infer<typeof chatRequestBodySchema>;

// Tools that change data: the client reloads the page data after they ran
export const mutatingToolNames: ReadonlySet<string> = new Set(["createList", "renameList", "deleteList", "createTodo", "updateTodo", "deleteTodo"]);
