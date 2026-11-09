import type { ApiOutputs } from "~/api/client";
import { useNavigationData } from "~/modules/navigation";

export const todosModuleId = "todos";

// The user's lists with their number of open todos: the navigation data of the module (loaded by the app layout with api.lists.list)
export function useLists() {
    return useNavigationData(todosModuleId) as ApiOutputs["lists"]["list"];
}
