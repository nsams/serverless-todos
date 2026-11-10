import type { AppModule } from "~/modules/types";
import { NoContent } from "~/routes/root";

import { notesModuleId } from "./moduleId";
import { notebooksNavigation } from "./navigation";
import { notebookRoute, notebooksRoute, noteRoute } from "./routes";

// The notes module (notebooks and Markdown notes), app shell part. Server part: module.server.ts;
// routes: routes.ts (/notes, /notes/:notebookId, /notes/:notebookId/:noteId).
export const notesModule: AppModule = {
    id: notesModuleId,
    routes: [
        // only redirects
        { ...notebooksRoute.route, Component: NoContent },
        // the pages are loaded with their route (code splitting), the loaders don't wait for them
        { ...notebookRoute.route, lazy: () => import("./pages/notebook") },
        { ...noteRoute.route, lazy: () => import("./pages/note") },
    ],
    navigation: notebooksNavigation,
    chat: {
        suggestions: ["Summarize my latest note", "Turn this note into todos"],
    },
};
