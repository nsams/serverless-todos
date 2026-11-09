import { parseResponse } from "hono/client";

import { api } from "~/api/client";
import { useNavigationData } from "~/modules/navigation";

export const todosModuleId = "todos";

// The user's lists with their number of open todos: the navigation data of the module, loaded by the app layout
export function loadLists() {
    return parseResponse(api.lists.$get());
}

export function useLists() {
    return useNavigationData(todosModuleId) as Awaited<ReturnType<typeof loadLists>>;
}
