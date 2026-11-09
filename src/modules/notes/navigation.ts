import { useSuspenseQuery } from "@tanstack/react-query";

import { trpc } from "~/api/query";

export const notesModuleId = "notes";

// The user's notebooks with their number of notes: the navigation data of the module (loaded by the app layout, see module.ts)
export function useNotebooks() {
    return useSuspenseQuery(trpc.notebooks.list.queryOptions()).data;
}
