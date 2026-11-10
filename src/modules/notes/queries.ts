import { queryOptions, useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import type { OperationInput } from "~/operations";

import { notesClient } from "./api";
import { notesModuleId } from "./moduleId";
import type { noteOperations } from "./operations.server";

// The module's data in the query cache (loaded with the module's API client, api.ts). Every key starts with the module's id, so a change
// reloads all of it (useInvalidateModule, src/moduleQueries.ts).

// The user's notebooks with their number of notes: the module's navigation data (sidebar)
export const notebooksQuery = queryOptions({
    queryKey: [notesModuleId, "notebooks"],
    queryFn: () => parseResponse(notesClient.notebooks.$get()),
});

// The user's notebooks for the pages (e.g. the "move to" menu): empty while loading, the page doesn't wait for them
export function useNotebooks() {
    return useQuery(notebooksQuery).data ?? [];
}

// The key of all pages of the notebooks' grids
export const notesListsKey = [notesModuleId, "notes"] as const;

// A page of a notebook's notes for its grid (sorted, filtered and searched as in the URL)
export function notesQuery({ notebookId, ...query }: OperationInput<typeof noteOperations.listNotes>) {
    return queryOptions({
        queryKey: [...notesListsKey, notebookId, query],
        queryFn: () => parseResponse(notesClient.notebooks[":notebookId"].notes.$get({ param: { notebookId }, query })),
    });
}

// A note with its body (editor)
export function noteQuery(id: string) {
    return queryOptions({ queryKey: [notesModuleId, "note", id], queryFn: () => parseResponse(notesClient.notes[":id"].$get({ param: { id } })) });
}

// A note of a notebook's grid as the API returns it (JSON: the dates are ISO strings)
export type NoteSummary = Awaited<ReturnType<NonNullable<ReturnType<typeof notesQuery>["queryFn"]>>>["notes"][number];

// A note as the API returns it (JSON: the dates are ISO strings)
export type Note = Awaited<ReturnType<NonNullable<ReturnType<typeof noteQuery>["queryFn"]>>>;
