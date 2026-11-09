import { type QueryClient, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { api } from "~/api/client";

export const todosModuleId = "todos";

// The user's lists with their number of open todos: the navigation data of the module, loaded by the app layout's loader
const listsQueryOptions = queryOptions({ queryKey: ["lists"], queryFn: () => parseResponse(api.lists.$get()) });

export function loadLists(queryClient: QueryClient) {
    return queryClient.fetchQuery(listsQueryOptions);
}

export function useLists() {
    return useSuspenseQuery(listsQueryOptions).data;
}
