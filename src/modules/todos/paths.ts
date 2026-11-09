import type { CheckedRouteId } from "~/chat/chat";

// Route ids of the module's pages (routes/), also used by the server (chat context, module.server.ts), see ChatPage in src/chat/chat.ts

// a list's page (routes/lists.$listId.tsx)
export const listRouteId = "/_app/lists/$listId";
// fails to compile if the route doesn't exist (e.g. after renaming the route file)
export type ListRouteId = CheckedRouteId<typeof listRouteId>;
