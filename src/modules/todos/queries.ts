import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { api } from "~/api/client";
import type { GridSearch } from "~/gridSearch";
import { toQuery } from "~/searchParams";

export const todosModuleId = "todos";

// The module's queries (TanStack Query). Their keys start with the module's id: a change invalidates all of them (todosQueryKey),
// e.g. a new todo changes the list's todos and the open count in the sidebar.
export const todosQueryKey = [todosModuleId];

// The user's lists with their number of open todos (the sidebar, the lists to move a todo to)
export const listsQuery = queryOptions({
    queryKey: [todosModuleId, "lists"],
    queryFn: () => parseResponse(api.lists.$get()),
});

// The list and a page of its todos (search: the grid state, see src/gridSearch.ts)
export function listTodosQuery(listId: string, search: GridSearch) {
    return queryOptions({
        queryKey: [todosModuleId, "lists", listId, "todos", search],
        queryFn: () => parseResponse(api.lists[":listId"].todos.$get({ param: { listId }, query: toQuery(search) })),
        // the grid shows the previous rows while the rows for new search params (e.g. the next page) are loading
        placeholderData: keepPreviousData,
    });
}
