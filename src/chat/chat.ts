import { z } from "zod";

import { dateStringSchema } from "~/dates";

// Shared by the chat agent (server) and the chat panel (client)

// Path the client connects to (WebSocket and HTTP); the server picks the agent instance of the authenticated user (src/server.ts)
export const chatAgentPath = "chat-agent";

// The page currently shown in the app: the route (React Router route id, e.g. "todos/list", see src/modules/todos/paths.ts) and its params.
// The modules tell the assistant what the user is looking at (ServerModule.chatContext), e.g. the current list as default list for new todos.
const chatPageSchema = z.object({ routeId: z.string(), params: z.record(z.string(), z.string()) });

export type ChatPage = z.infer<typeof chatPageSchema>;

// Sent by the client with every chat message: the server doesn't know the user's local date or what they are looking at
export const chatRequestBodySchema = z.object({
    // the user's local date (YYYY-MM-DD), for relative dates like "tomorrow"
    today: dateStringSchema.optional(),
    page: chatPageSchema.optional(),
});

export type ChatRequestBody = z.infer<typeof chatRequestBodySchema>;
