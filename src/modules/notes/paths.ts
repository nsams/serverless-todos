import { defineRoute } from "~/routeDefinition";

import { validateNoteSearch } from "./noteSearch";

// The routes of the module's pages (pages.ts): paths, params, search params, route ids; also used by the server (chat context, module.server.ts)

// Route ids of a notebook's page and of a note's page, see ChatPage in src/chat/chat.ts
export const notebookRouteId = "notes/notebook";
export const noteRouteId = "notes/note";

// redirects to the user's first notebook
export const defaultNotebookRoute = defineRoute({ path: "/notes" });

// the notes of a notebook; the grid state (pagination, sorting, filtering) and the search text (q) live in the search params
export const notebookRoute = defineRoute({ id: notebookRouteId, path: "/notes/:notebookId", validateSearch: validateNoteSearch });

// a note in the editor; the search params are the notebook's (its grid state), kept for the back link
export const noteRoute = defineRoute({ id: noteRouteId, path: "/notes/:notebookId/:noteId", validateSearch: validateNoteSearch });
