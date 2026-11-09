import { useSuspenseQuery } from "@tanstack/react-query";

import { trpc } from "~/api/query";

export const todosModuleId = "todos";

// The user's lists with their number of open todos: the navigation data of the module (loaded by the app layout, see module.ts)
export function useLists() {
    return useSuspenseQuery(trpc.lists.list.queryOptions()).data;
}
