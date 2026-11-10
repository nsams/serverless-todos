import type { AppModule } from "~/modules/types";

import { ListsNavigation } from "./components/ListsNavigation";
import { listLists } from "./lists.functions";
import { todosModuleId } from "./moduleId";

// The todos module (todo lists and todos), app shell part. Server part: module.server.ts; routes: routes/ (/lists, /lists/$listId).
export const todosModule: AppModule = {
    id: todosModuleId,
    navigation: {
        title: "Todo lists",
        loader: () => listLists(),
        Component: ListsNavigation,
    },
    chat: {
        suggestions: ["Add a todo “Buy milk”", "What is due this week?", "Which lists do I have?"],
        // the operations with effect "write" or "delete" in operations.server.ts
        mutatingToolNames: ["createList", "renameList", "deleteList", "createTodo", "updateTodo", "deleteTodo"],
    },
};
