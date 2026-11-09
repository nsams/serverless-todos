import type { RouteObject } from "react-router";

import { NoContent } from "~/routes/root";

import { notebookRouteId, noteRouteId } from "./paths";
import { defaultNotebookLoader } from "./routes/defaultNotebook";
import { NoteError, noteLoader, NotePage } from "./routes/note";
import { notebookLoader, NotebookPage } from "./routes/notebook";

// The module's pages, mounted into the app layout
export const notesRoutes: RouteObject[] = [
    {
        path: "notes",
        children: [
            // redirects to the user's first notebook
            { index: true, loader: defaultNotebookLoader, Component: NoContent },
            {
                path: ":notebookId",
                children: [
                    { id: notebookRouteId, index: true, loader: notebookLoader, Component: NotebookPage },
                    { id: noteRouteId, path: ":noteId", loader: noteLoader, Component: NotePage, ErrorBoundary: NoteError },
                ],
            },
        ],
    },
];
