import type { AppModule } from "~/modules/types";

import { NotebooksNavigation } from "./components/NotebooksNavigation";
import { notesModuleId } from "./moduleId";
import { notebooksQuery } from "./queries";

// The notes module (notebooks and Markdown notes), app shell part. Server part: module.server.ts;
// routes: routes/ (/notes, /notes/$notebookId, /notes/$notebookId/$noteId).
export const notesModule: AppModule = {
    id: notesModuleId,
    navigation: {
        title: "Notes",
        prefetch: (queryClient) => queryClient.prefetchQuery(notebooksQuery),
        Component: NotebooksNavigation,
    },
    chat: {
        suggestions: ["Summarize my latest note", "Turn this note into todos"],
    },
};
