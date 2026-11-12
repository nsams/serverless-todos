import { defineChatContext } from "~/chat/chatPage";
import type { ServerModule } from "~/modules/types";

import { todosRouter } from "./api.server";
import { todosChatPage } from "./chatPage";
import { getListRepository } from "./db/lists.server";
import { getTodoRepository } from "./db/todos.server";
import { todosModuleId } from "./moduleId";
import { todoInstructions, todoOperations } from "./operations.server";

// The todos module (todo lists and todos), server part. App shell part: module.ts.
export const serverModule: ServerModule = {
    id: todosModuleId,
    operations: todoOperations,
    api: todosRouter,
    instructions: todoInstructions,
    chatContext: defineChatContext(todosChatPage, async (userId, page) => {
        const currentList = page ? await getListRepository().get(userId, page.listId) : undefined;
        const currentTodo = page?.todoId ? await getTodoRepository().get(userId, page.todoId) : undefined;
        return [
            ...(currentTodo
                ? [
                      `The user is currently editing the todo "${currentTodo.title}" (id ${currentTodo.id}) in a form. "This todo" refers to it. Changes you make to it are taken over by the form, unless the user has changed the same field there.`,
                  ]
                : []),
            currentList
                ? `The user is currently looking at the todo list "${currentList.name}" (id ${currentList.id}). Add new todos to this list unless the user names another one.`
                : "The user isn't looking at a todo list right now. If it's unclear which list is meant, look up the lists and ask.",
        ];
    }),
};
