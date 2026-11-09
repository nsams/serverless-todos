import { api } from "~/api/client";
import type { AppModule } from "~/modules/types";

import { ListsNavigation } from "./components/ListsNavigation";
import { todosModuleId } from "./navigation";
import { todosRoutes } from "./routes";

// The todos module (todo lists and todos), app shell part. Server part: module.server.ts; pages: routes.tsx (/lists, /lists/:listId).
export const todosModule: AppModule = {
    id: todosModuleId,
    routes: todosRoutes,
    navigation: {
        title: "Todo lists",
        loader: () => api.lists.list.query(),
        Component: ListsNavigation,
    },
    chat: {
        suggestions: ["Add a todo “Buy milk”", "What is due this week?", "Which lists do I have?"],
        // the tools with effect "write" or "delete" in tools.server.ts
        mutatingToolNames: ["createList", "renameList", "deleteList", "createTodo", "updateTodo", "deleteTodo"],
    },
};
