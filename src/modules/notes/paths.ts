import type { CheckedRouteId } from "~/chat/chat";

// Route ids of the module's pages (routes/), also used by the server (chat context, module.server.ts), see ChatPage in src/chat/chat.ts

// a notebook's page (routes/notes.$notebookId.index.tsx) and a note's page (routes/notes.$notebookId.$noteId.tsx)
export const notebookRouteId = "/_app/notes/$notebookId/";
export const noteRouteId = "/_app/notes/$notebookId/$noteId";
// fail to compile if the routes don't exist (e.g. after renaming the route files)
export type NotebookRouteId = CheckedRouteId<typeof notebookRouteId>;
export type NoteRouteId = CheckedRouteId<typeof noteRouteId>;
