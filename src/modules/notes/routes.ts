import { replace } from "react-router";

import { defaultCollectionId } from "~/collections";
import { lastPageWithRows } from "~/gridSearch";
import { defineRoute } from "~/routing";

import { notesApi } from "./api";
import { parseNoteSearch, validateNoteSearch } from "./noteSearch";

// The module's routes (mounted with their pages in module.ts)

// The user's first notebook (created if the user has none yet)
export const notebooksRoute = defineRoute({
    path: "/notes",
    loader: async ({ request: { signal } }): Promise<never> => {
        const notebookId = await defaultCollectionId(notesApi.listNotebooks.query({}, { signal }), () => notesApi.getDefaultNotebook.mutate({}));
        throw replace(notebookRoute.href({ notebookId }));
    },
});

// The notes of a notebook in a grid (pages/notebook.tsx): pagination, sorting, filtering on the server, state in the URL. A note opens in
// the editor (noteRoute), which keeps the grid state for its back link.
export const notebookRoute = defineRoute({
    path: "/notes/:notebookId",
    validateSearch: validateNoteSearch,
    loader: async ({ params: { notebookId }, search, request: { signal } }) => {
        const result = await notesApi.listNotes.query({ notebookId, ...search }, { signal });
        // e.g. after deleting the last note of the last page
        const lastPage = lastPageWithRows(parseNoteSearch(search), result.notes.length, result.totalCount);
        if (lastPage !== undefined) {
            throw replace(notebookRoute.href({ notebookId }, { ...search, page: lastPage || undefined }));
        }
        return result;
    },
});

// A note in the editor (pages/note.tsx). The search params are the state of the notebook's grid, kept for the back link.
export const noteRoute = defineRoute({
    path: "/notes/:notebookId/:noteId",
    validateSearch: validateNoteSearch,
    loader: async ({ params: { notebookId, noteId }, search, request: { signal } }) => {
        const note = await notesApi.getNote.query({ id: noteId }, { signal });
        // moved to another notebook (in the editor or by the assistant): the URL follows the note
        if (note.notebookId !== notebookId) {
            throw replace(noteRoute.href({ notebookId: note.notebookId, noteId }, search));
        }
        return note;
    },
});
