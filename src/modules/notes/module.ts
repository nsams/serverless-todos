import type { AppModule } from "~/modules/types";

import { notesApi } from "./api";
import { NotebooksNavigation } from "./components/NotebooksNavigation";
import { notesModuleId } from "./moduleId";

// The notes module (notebooks and Markdown notes), app shell part. Server part: module.server.ts;
// routes: routes/ (/notes, /notes/$notebookId, /notes/$notebookId/$noteId).
export const notesModule: AppModule = {
    id: notesModuleId,
    navigation: {
        title: "Notes",
        prefetch: (queryClient) => queryClient.prefetchQuery(notesApi.listNotebooks.queryOptions({})),
        Component: NotebooksNavigation,
    },
    chat: {
        suggestions: ["Summarize my latest note", "Turn this note into todos"],
    },
};
