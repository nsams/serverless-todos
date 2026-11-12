import { queryOptions, useQuery } from "@tanstack/react-query";

import type { OperationInput } from "~/operations";

import { listLists } from "./lists.functions";
import { todosModuleId } from "./moduleId";
import type { todoOperations } from "./operations.server";
import { getTodo, listTodos } from "./todos.functions";

// The module's data in the query cache (loaded with the server functions). Every key starts with the module's id, so a change reloads
// all of it (useInvalidateModule, src/moduleQueries.ts).

// The user's lists with their number of open todos: the module's navigation data (sidebar)
export const listsQuery = queryOptions({ queryKey: [todosModuleId, "lists"], queryFn: () => listLists() });

// The user's lists for the pages (e.g. the "move to" menu): empty while loading, the page doesn't wait for them
export function useLists() {
    return useQuery(listsQuery).data ?? [];
}

// A page of a list's todos for its grid (sorted and filtered as in the URL)
export function todosQuery(input: OperationInput<typeof todoOperations.listTodos>) {
    return queryOptions({ queryKey: [todosModuleId, "todos", input], queryFn: () => listTodos({ data: input }) });
}

// A todo (detail page)
export function todoQuery(id: string) {
    return queryOptions({ queryKey: [todosModuleId, "todo", id], queryFn: () => getTodo({ data: { id } }) });
}
