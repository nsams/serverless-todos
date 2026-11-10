import { useMutation } from "@tanstack/react-query";

import { CollectionIndex } from "~/collections";
import { defineRoute } from "~/routing";

import { notesApi } from "./api";
import { validateNoteSearch } from "./noteSearch";

// The module's routes (mounted in module.ts)

// The user's first notebook (created if the user has none yet)
export const notebooksRoute = defineRoute({
    path: "/notes",
    Component: function NotebooksIndex() {
        const getDefaultNotebook = useMutation(notesApi.getDefaultNotebook.mutationOptions());
        return (
            <CollectionIndex
                collections={notesApi.listNotebooks.queryOptions({})}
                createDefault={() => getDefaultNotebook.mutateAsync({})}
                href={(notebookId) => notebookRoute.href({ notebookId })}
            />
        );
    },
});

// The notes of a notebook in a grid (pages/notebook.tsx): pagination, sorting, filtering on the server, state in the URL. A note opens in
// the editor (noteRoute), which keeps the grid state for its back link.
export const notebookRoute = defineRoute({
    path: "/notes/:notebookId",
    validateSearch: validateNoteSearch,
    query: ({ params: { notebookId }, search }) => notesApi.listNotes.queryOptions({ notebookId, ...search }),
    page: () => import("./pages/notebook"),
});

// A note in the editor (pages/note.tsx). The search params are the state of the notebook's grid, kept for the back link.
export const noteRoute = defineRoute({
    path: "/notes/:notebookId/:noteId",
    validateSearch: validateNoteSearch,
    query: ({ params: { noteId } }) => notesApi.getNote.queryOptions({ id: noteId }),
    page: () => import("./pages/note"),
});
