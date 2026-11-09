// Paths and route ids of the module's pages (routes.tsx), also used by the server (chat context, module.server.ts)

// Route id of a list's page, see ChatPage in src/chat/chat.ts
export const listRouteId = "todos/list";

export function listPath(listId: string) {
    return `/lists/${encodeURIComponent(listId)}`;
}
