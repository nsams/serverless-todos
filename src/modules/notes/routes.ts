import { parseResponse } from "hono/client";
import { generatePath, replace, type RouteObject } from "react-router";

import { api } from "~/api/client";

import { notebookPath, notebooksPath, notePath } from "./paths";
import { notebookLoader, NotebookPage } from "./routes/NotebookPage";
import { noteLoader, NotePage, NotePageErrorBoundary } from "./routes/NotePage";

// The module's pages (ids: their paths, see paths.ts)
export const notesRoutes: RouteObject[] = [
    {
        // the user's first notebook (created if the user has none yet)
        id: notebooksPath,
        path: notebooksPath,
        loader: async () => {
            const { id } = await parseResponse(api.notebooks.default.$post());
            return replace(generatePath(notebookPath, { notebookId: id }));
        },
    },
    { id: notebookPath, path: notebookPath, loader: notebookLoader, Component: NotebookPage },
    { id: notePath, path: notePath, loader: noteLoader, Component: NotePage, ErrorBoundary: NotePageErrorBoundary },
];
