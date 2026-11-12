import { parseResponse } from "hono/client";
import { lazy } from "react";

import { defaultCollectionPage } from "~/components/DefaultRedirect";
import type { AppModule } from "~/modules/types";

import { notesClient } from "./api";
import { NotebooksNavigation } from "./components/NotebooksNavigation";
import { notesModuleId } from "./moduleId";
import { notebooksQuery } from "./queries";
import { notebookRoute, notebooksRoute, noteRoute } from "./routes";

// The notes module (notebooks and Markdown notes), app shell part. Server part: module.server.ts (REST API: api.server.ts);
// pages: routes.ts (/notes, /notes/:notebookId, /notes/:notebookId/:noteId).
export const notesModule: AppModule = {
    id: notesModuleId,
    pages: [
        {
            path: notebooksRoute.path,
            Component: defaultCollectionPage({
                moduleId: notesModuleId,
                collectionsQuery: notebooksQuery,
                createDefault: () => parseResponse(notesClient.notebooks.default.$post()),
                href: (notebookId) => notebookRoute.href({ notebookId }),
            }),
        },
        // the pages' code is loaded when they are opened
        { path: notebookRoute.path, Component: lazy(() => import("./pages/NotebookPage")) },
        { path: noteRoute.path, Component: lazy(() => import("./pages/NotePage")) },
    ],
    navigation: {
        title: "Notes",
        Component: NotebooksNavigation,
    },
    chat: {
        suggestions: ["Summarize my latest note", "Turn this note into todos"],
    },
};
