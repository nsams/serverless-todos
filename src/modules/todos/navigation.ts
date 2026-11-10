import { useNavigationData } from "~/modules/navigation";

import type { listLists } from "./lists.functions";
import { todosModuleId } from "./moduleId";

// The user's lists with their number of open todos: the navigation data of the module (loaded by the app layout with listLists)
export function useLists() {
    return useNavigationData(todosModuleId) as Awaited<ReturnType<typeof listLists>>;
}
