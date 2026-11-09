import type { ServerModule } from "~/modules/types";

import { getListRepository } from "./db/lists.server";
import { listPath } from "./paths";
import { createTodoTools, todoToolsInstructions } from "./tools.server";

// The todos module (todo lists and todos), server part (REST API: api.server.ts). App shell part: module.ts.
export const todosServerModule: ServerModule = {
    createTools: createTodoTools,
    instructions: todoToolsInstructions,
    chatContext: async (userId, page) => {
        const currentList = page?.routeId === listPath && page.params.listId ? await getListRepository().get(userId, page.params.listId) : undefined;
        return [
            currentList
                ? `The user is currently looking at the todo list "${currentList.name}" (id ${currentList.id}). Add new todos to this list unless the user names another one.`
                : "The user isn't looking at a todo list right now. If it's unclear which list is meant, look up the lists and ask.",
        ];
    },
};
