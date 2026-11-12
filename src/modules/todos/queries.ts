import { queryOptions, useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import type { OperationInput } from "~/operations";

import { todosClient } from "./api";
import { todosModuleId } from "./moduleId";
import type { todoOperations } from "./operations.server";

// The module's data in the query cache (loaded with the module's typed client). Every key starts with the module's id, so a change
// reloads all of it (useInvalidateModule, src/client/queries.ts), e.g. a new todo changes the list's todos and the open count in the sidebar.

// The user's lists with their number of open todos: the module's navigation data (sidebar)
export const listsQuery = queryOptions({ queryKey: [todosModuleId, "lists"], queryFn: () => parseResponse(todosClient.lists.$get()) });

// The user's lists for the pages (e.g. the "move to" menu): empty while loading, the page doesn't wait for them
export function useLists() {
    return useQuery(listsQuery).data ?? [];
}

// The list and a page of its todos for its grid (sorted and filtered as in the URL)
export function todosQuery({ listId, ...search }: OperationInput<typeof todoOperations.listTodos>) {
    return queryOptions({
        queryKey: [todosModuleId, "todos", listId, search],
        queryFn: () => parseResponse(todosClient.lists[":listId"].todos.$get({ param: { listId }, query: search })),
    });
}

// A todo (its detail page)
export function todoQuery(id: string) {
    return queryOptions({
        queryKey: [todosModuleId, "todo", id],
        queryFn: () => parseResponse(todosClient.todos[":id"].$get({ param: { id } })),
    });
}

// A todo's history, newest entry first (its detail page). Reloaded with the module's data, e.g. after the todo was saved.
export function todoHistoryQuery(id: string) {
    return queryOptions({
        queryKey: [todosModuleId, "todoHistory", id],
        queryFn: () => parseResponse(todosClient.todos[":id"].history.$get({ param: { id } })),
    });
}
