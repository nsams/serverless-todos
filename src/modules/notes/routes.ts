import { parseResponse } from "hono/client";
import { replace } from "react-router";

import { defineRoute, redirectToLastPageWithRows } from "~/client/routing";

import { notesClient } from "./api";
import { validateNoteSearch } from "./noteSearch";

// The module's pages (src/client/routing.ts): paths, search params and loaders, for the links (href) and the pages (pages/).
// The route objects are in module.ts.

// The notes of a notebook in a grid (pagination, sorting, filtering on the server, state and search text in the URL); a note opens
// in the editor, which keeps the grid state for its back link
export const notebookRoute = defineRoute({
    path: "/notes/:notebookId",
    validateSearch: validateNoteSearch,
    loader: async ({ params: { notebookId }, search, href }) => {
        const result = await parseResponse(notesClient.notebooks[":notebookId"].notes.$get({ param: { notebookId }, query: search }));
        // e.g. after deleting the last note of the last page
        redirectToLastPageWithRows(search, { rowsOnPage: result.notes.length, totalCount: result.totalCount }, (lastPage) =>
            href({ notebookId }, lastPage),
        );
        return result;
    },
});

// A note in the editor. The search params are the state of the notebook's grid, kept for the back link.
export const noteRoute = defineRoute({
    path: "/notes/:notebookId/:noteId",
    validateSearch: validateNoteSearch,
    loader: async ({ params: { notebookId, noteId }, search, href }) => {
        const note = await parseResponse(notesClient.notes[":id"].$get({ param: { id: noteId } }));
        // e.g. moved to another notebook by the assistant
        if (note.notebookId !== notebookId) {
            throw replace(href({ notebookId: note.notebookId, noteId }, search));
        }
        return note;
    },
});

// The user's first notebook (created if the user has none yet)
export const notebooksRoute = defineRoute({
    path: "/notes",
    loader: async () => {
        const notebook = await parseResponse(notesClient.notebooks.default.$post());
        throw replace(notebookRoute.href({ notebookId: notebook.id }));
    },
});
