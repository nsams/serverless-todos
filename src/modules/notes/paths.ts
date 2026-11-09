// Paths and route ids of the module's pages (routes.tsx), also used by the server (chat context, module.server.ts)

// Route ids of a notebook's page and of a note's page, see ChatPage in src/chat/chat.ts
export const notebookRouteId = "notes/notebook";
export const noteRouteId = "notes/note";

export function notebookPath(notebookId: string) {
    return `/notes/${encodeURIComponent(notebookId)}`;
}

export function notePath(notebookId: string, noteId: string) {
    return `${notebookPath(notebookId)}/${encodeURIComponent(noteId)}`;
}
