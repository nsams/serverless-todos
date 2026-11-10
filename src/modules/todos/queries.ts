import { queryOptions, useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import type { OperationInput } from "~/operations";

import { todosClient } from "./api";
import { todosModuleId } from "./moduleId";
import type { todoOperations } from "./operations.server";

// The module's data in the query cache (loaded with the module's API client, api.ts). Every key starts with the module's id, so a change
// reloads all of it (useInvalidateModule, src/moduleQueries.ts).

// The user's lists with their number of open todos: the module's navigation data (sidebar)
export const listsQuery = queryOptions({ queryKey: [todosModuleId, "lists"], queryFn: () => parseResponse(todosClient.lists.$get()) });

// The user's lists for the pages (e.g. the "move to" menu): empty while loading, the page doesn't wait for them
export function useLists() {
    return useQuery(listsQuery).data ?? [];
}

// A page of a list's todos for its grid (sorted and filtered as in the URL)
export function todosQuery({ listId, ...query }: OperationInput<typeof todoOperations.listTodos>) {
    return queryOptions({
        queryKey: [todosModuleId, "todos", listId, query],
        queryFn: () => parseResponse(todosClient.lists[":listId"].todos.$get({ param: { listId }, query })),
    });
}

// A todo as the API returns it (JSON: createdAt is an ISO string)
export type Todo = Awaited<ReturnType<NonNullable<ReturnType<typeof todosQuery>["queryFn"]>>>["todos"][number];
