import { useQuery } from "@tanstack/react-query";

import { invalidate, trpc } from "~/api/client";

// The user's lists with their number of open todos (sidebar, move menu of a todo); loaded once and cached, reloaded after changes
export function useLists() {
    return useQuery(trpc.lists.list.queryOptions()).data;
}

// Reloads the lists after a list was created or deleted
export function invalidateLists() {
    return invalidate(trpc.lists.pathFilter());
}

// Reloads the module's data after a change: the lists (e.g. the open counts in the sidebar) and the todos
export function invalidateTodos() {
    return invalidate(trpc.lists.pathFilter(), trpc.todos.pathFilter());
}
