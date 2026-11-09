import { type QueryClient, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { api } from "~/api/client";

export const notesModuleId = "notes";

// The user's notebooks with their number of notes: the navigation data of the module, loaded by the app layout's loader
const notebooksQueryOptions = queryOptions({ queryKey: ["notebooks"], queryFn: () => parseResponse(api.notebooks.$get()) });

export function loadNotebooks(queryClient: QueryClient) {
    return queryClient.fetchQuery(notebooksQueryOptions);
}

export function useNotebooks() {
    return useSuspenseQuery(notebooksQueryOptions).data;
}
