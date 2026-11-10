import { useNavigationData, useOperations } from "~/modules/client";

import type { todosServerModule } from "./module.server";
import { todosModuleId } from "./moduleId";

// The module's server data on the client (src/modules/client.ts)

// Runs the module's operations (operations.server.ts), e.g. run("createTodo", { listId, title })
export function useTodoOperations() {
    return useOperations<typeof todosServerModule>(todosModuleId);
}

// The user's lists with their number of open todos (sidebar data, see module.server.ts)
export function useLists() {
    return useNavigationData<typeof todosServerModule>(todosModuleId);
}
