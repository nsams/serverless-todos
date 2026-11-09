import type { AppModule } from "~/modules/types";

import { ListsNavigation } from "./components/ListsNavigation";
import { todosPages } from "./pages";
import { todosModuleId } from "./queries";

// The todos module (todo lists and todos), app shell part. Server part: module.server.ts (REST API: api.server.ts);
// pages: pages.tsx (/lists, /lists/:listId).
export const todosModule: AppModule = {
    id: todosModuleId,
    pages: todosPages,
    navigation: {
        title: "Todo lists",
        Component: ListsNavigation,
    },
    chat: {
        suggestions: ["Add a todo “Buy milk”", "What is due this week?", "Which lists do I have?"],
        // the tools with effect "write" or "delete" in tools.server.ts
        mutatingToolNames: ["createList", "renameList", "deleteList", "createTodo", "updateTodo", "deleteTodo"],
    },
};
