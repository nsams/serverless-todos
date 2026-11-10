import type { AppModule } from "~/modules/types";

import { NotebooksNavigation } from "./components/NotebooksNavigation";
import { notesModuleId } from "./moduleId";
import { notebooksNavigation } from "./navigation";
import { notebookRoute, notebooksRoute, noteRoute } from "./routes";

// The notes module (notebooks and Markdown notes), app shell part. Server part: module.server.ts (REST API: api.server.ts);
// pages: routes.ts (/notes, /notes/:notebookId, /notes/:notebookId/:noteId).
export const notesModule: AppModule = {
    id: notesModuleId,
    // the pages' code is loaded when they are opened (in parallel with their loader's data)
    routes: [
        notebooksRoute.route,
        { ...notebookRoute.route, lazy: { Component: async () => (await import("./pages/NotebookPage")).NotebookPage } },
        {
            ...noteRoute.route,
            lazy: async () => {
                const { NotePage, NotePageErrorBoundary } = await import("./pages/NotePage");
                return { Component: NotePage, ErrorBoundary: NotePageErrorBoundary };
            },
        },
    ],
    navigation: {
        title: "Notes",
        data: notebooksNavigation,
        Component: NotebooksNavigation,
    },
    chat: {
        suggestions: ["Summarize my latest note", "Turn this note into todos"],
    },
};
