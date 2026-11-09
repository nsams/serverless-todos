import type { AppModule } from "~/modules/types";

import { ListsNavigation } from "./components/ListsNavigation";
import { todosPages } from "./pages";

// The todos module (todo lists and todos), app shell part. Server part: module.server.ts; pages: pages.ts (/lists, /lists/:listId).
export const todosModule: AppModule = {
    id: "todos",
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
