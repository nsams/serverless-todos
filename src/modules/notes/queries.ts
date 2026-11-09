import { useQuery } from "@tanstack/react-query";

import { invalidate, trpc } from "~/api/client";

// The user's notebooks with their number of notes (sidebar, move menus); loaded once and cached, reloaded after changes
export function useNotebooks() {
    return useQuery(trpc.notebooks.list.queryOptions()).data;
}

// Reloads the notebooks after a notebook was created or deleted
export function invalidateNotebooks() {
    return invalidate(trpc.notebooks.pathFilter());
}

// Reloads the module's data after a change: the notebooks (e.g. the note counts in the sidebar) and the notes
export function invalidateNotes() {
    return invalidate(trpc.notebooks.pathFilter(), trpc.notes.pathFilter());
}
