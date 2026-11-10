import { queryOptions, useQuery } from "@tanstack/react-query";

import type { OperationInput } from "~/operations";

import { notesModuleId } from "./moduleId";
import { listNotebooks } from "./notebooks.functions";
import { getNote, listNotes } from "./notes.functions";
import type { noteOperations } from "./operations.server";

// The module's data in the query cache (loaded with the server functions). Every key starts with the module's id, so a change reloads
// all of it (useInvalidateModule, src/moduleQueries.ts).

// The user's notebooks with their number of notes: the module's navigation data (sidebar)
export const notebooksQuery = queryOptions({ queryKey: [notesModuleId, "notebooks"], queryFn: () => listNotebooks() });

// The user's notebooks for the pages (e.g. the "move to" menu): empty while loading, the page doesn't wait for them
export function useNotebooks() {
    return useQuery(notebooksQuery).data ?? [];
}

// The key of all pages of the notebooks' grids
export const notesListsKey = [notesModuleId, "notes"] as const;

// A page of a notebook's notes for its grid (sorted, filtered and searched as in the URL)
export function notesQuery(input: OperationInput<typeof noteOperations.listNotes>) {
    return queryOptions({ queryKey: [...notesListsKey, input], queryFn: () => listNotes({ data: input }) });
}

// A note with its body (editor)
export function noteQuery(id: string) {
    return queryOptions({ queryKey: [notesModuleId, "note", id], queryFn: () => getNote({ data: { id } }) });
}
