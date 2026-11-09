import type { AppModule } from "~/modules/types";

import { NotebooksNavigation } from "./components/NotebooksNavigation";
import { loadNotebooks, notesModuleId } from "./navigation";
import { notesRoutes } from "./routes";

// The notes module (notebooks and Markdown notes), app shell part. Server part: module.server.ts (REST API: api.server.ts);
// pages: routes.ts (/notes, /notes/:notebookId, /notes/:notebookId/:noteId).
export const notesModule: AppModule = {
    id: notesModuleId,
    routes: notesRoutes,
    navigation: {
        title: "Notes",
        loader: loadNotebooks,
        Component: NotebooksNavigation,
    },
    chat: {
        suggestions: ["Summarize my latest note", "Turn this note into todos"],
        // the tools with effect "write" or "delete" in tools.server.ts
        mutatingToolNames: ["createNotebook", "renameNotebook", "deleteNotebook", "createNote", "updateNote", "appendToNote", "deleteNote"],
    },
};
