import type { AppModule } from "~/modules/types";

import { NotebooksNavigation } from "./components/NotebooksNavigation";
import { notesModuleId } from "./moduleId";
import { notebooksNavigation } from "./navigation";
import { NotebookPage } from "./pages/NotebookPage";
import { NotePage, NotePageErrorBoundary } from "./pages/NotePage";
import { notebookRoute, notebooksRoute, noteRoute } from "./routes";

// The notes module (notebooks and Markdown notes), app shell part. Server part: module.server.ts (REST API: api.server.ts);
// pages: routes.ts (/notes, /notes/:notebookId, /notes/:notebookId/:noteId).
export const notesModule: AppModule = {
    id: notesModuleId,
    routes: [
        notebooksRoute.route,
        { ...notebookRoute.route, Component: NotebookPage },
        { ...noteRoute.route, Component: NotePage, ErrorBoundary: NotePageErrorBoundary },
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
