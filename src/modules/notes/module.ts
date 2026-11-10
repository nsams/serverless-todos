import type { AppModule } from "~/modules/types";

import { NotebooksNavigation } from "./components/NotebooksNavigation";
import { notesModuleId } from "./moduleId";
import { notebookRoute, notebooksRoute, noteRoute } from "./routes";

// The notes module (notebooks and Markdown notes), app shell part. Server part: module.server.ts;
// routes: routes.tsx (/notes, /notes/:notebookId, /notes/:notebookId/:noteId).
export const notesModule: AppModule = {
    id: notesModuleId,
    routes: [notebooksRoute, notebookRoute, noteRoute],
    navigation: {
        title: "Notes",
        Component: NotebooksNavigation,
    },
    chat: {
        suggestions: ["Summarize my latest note", "Turn this note into todos"],
    },
};
