import type { AppModule } from "~/modules/types";

import { NotebooksNavigation } from "./components/NotebooksNavigation";
import { notesPages } from "./pages";
import { notesModuleId } from "./queries";

// The notes module (notebooks and Markdown notes), app shell part. Server part: module.server.ts (REST API: api.server.ts);
// pages: pages.tsx (/notes, /notes/:notebookId, /notes/:notebookId/:noteId).
export const notesModule: AppModule = {
    id: notesModuleId,
    pages: notesPages,
    navigation: {
        title: "Notes",
        Component: NotebooksNavigation,
    },
    chat: {
        suggestions: ["Summarize my latest note", "Turn this note into todos"],
        // the tools with effect "write" or "delete" in tools.server.ts
        mutatingToolNames: ["createNotebook", "renameNotebook", "deleteNotebook", "createNote", "updateNote", "appendToNote", "deleteNote"],
    },
};
