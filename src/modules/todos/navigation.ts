import { parseResponse } from "hono/client";

import { useNavigationData } from "~/modules/navigation";

import { todosClient } from "./api";
import { todosModuleId } from "./moduleId";

// The user's lists with their number of open todos: the navigation data of the module, loaded by the app layout
export function loadLists() {
    return parseResponse(todosClient.lists.$get());
}

export function useLists() {
    return useNavigationData(todosModuleId) as Awaited<ReturnType<typeof loadLists>>;
}
