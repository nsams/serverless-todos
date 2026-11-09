import { useNavigationData } from "~/modules/navigation";

import type { ListWithCount } from "./db/lists.server";

export const todosModuleId = "todos";

// The user's lists with their number of open todos: the navigation data of the module (loaded by the app layout, see module.server.ts)
export function useLists() {
    return useNavigationData(todosModuleId) as ListWithCount[];
}
