import type { RegisteredRouter, RouteIds } from "@tanstack/react-router";
import { z } from "zod";

import { dateStringSchema } from "~/dates";

// Shared by the chat agent (server) and the chat panel (client)

// Path the client connects to (WebSocket and HTTP); the server picks the agent instance of the authenticated user (src/server.ts)
export const chatAgentPath = "chat-agent";

// The route ids of the app (TanStack Router, e.g. "/_app/lists/$listId", see src/modules/todos/paths.ts), typed by the route tree
export type RouteId = RouteIds<RegisteredRouter["routeTree"]>;

// Checks that a route id used by the server (e.g. `export type ListRouteId = CheckedRouteId<typeof listRouteId>`) is a route of the
// route tree. A separate type, not `satisfies RouteId` on the constant: the server's types (the API's router) must not depend on the
// route tree, which depends on them.
export type CheckedRouteId<Id extends RouteId> = Id;

// The page currently shown in the app: the route (its route id) and its params.
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
