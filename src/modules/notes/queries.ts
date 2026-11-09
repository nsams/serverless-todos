import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { api } from "~/api/client";
import { toQuery } from "~/searchParams";

import type { NoteSearch } from "./noteSearch";

export const notesModuleId = "notes";

// The module's queries (TanStack Query). Their keys start with the module's id: a change invalidates all of them (notesQueryKey),
// e.g. a new note changes the notebook's notes and the note count in the sidebar.
export const notesQueryKey = [notesModuleId];

// The user's notebooks with their number of notes (the sidebar, the notebooks to move a note to)
export const notebooksQuery = queryOptions({
    queryKey: [notesModuleId, "notebooks"],
    queryFn: () => parseResponse(api.notebooks.$get()),
});

// The notebook and a page of its notes (search: the grid state and the search text, see noteSearch.ts)
export function notebookNotesQuery(notebookId: string, search: NoteSearch) {
    return queryOptions({
        queryKey: [notesModuleId, "notebooks", notebookId, "notes", search],
        queryFn: () => parseResponse(api.notebooks[":notebookId"].notes.$get({ param: { notebookId }, query: toQuery(search) })),
        // the grid shows the previous rows while the rows for new search params (e.g. the search text) are loading
        placeholderData: keepPreviousData,
    });
}

// A note with its body (the editor)
export function noteQuery(noteId: string) {
    return queryOptions({
        queryKey: [notesModuleId, "notes", noteId],
        queryFn: () => parseResponse(api.notes[":noteId"].$get({ param: { noteId } })),
    });
}
