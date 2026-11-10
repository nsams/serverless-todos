import { defineChatContext } from "~/chat/chatPage";
import type { ServerModule } from "~/modules/types";

import { todosApi } from "./api.server";
import { todosChatPage } from "./chatPage";
import { getListRepository } from "./db/lists.server";
import { todosModuleId } from "./moduleId";
import { todoInstructions, todoOperations } from "./operations.server";

// The todos module (todo lists and todos), server part (found by src/modules/registry.server.ts). App shell part: module.ts.
export const serverModule: ServerModule = {
    id: todosModuleId,
    operations: todoOperations,
    api: todosApi,
    instructions: todoInstructions,
    chatContext: defineChatContext(todosChatPage, async (userId, page) => {
        const currentList = page ? await getListRepository().get(userId, page.listId) : undefined;
        return [
            currentList
                ? `The user is currently looking at the todo list "${currentList.name}" (id ${currentList.id}). Add new todos to this list unless the user names another one.`
                : "The user isn't looking at a todo list right now. If it's unclear which list is meant, look up the lists and ask.",
        ];
    }),
};
