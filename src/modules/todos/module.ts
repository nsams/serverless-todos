import type { AppModule } from "~/modules/types";

import { ListsNavigation } from "./components/ListsNavigation";
import { todosModuleId } from "./moduleId";
import { loadLists } from "./navigation";
import { todosRoutes } from "./routes";

// The todos module (todo lists and todos), app shell part. Server part: module.server.ts (REST API: api.server.ts);
// pages: routes.ts (/lists, /lists/:listId).
export const todosModule: AppModule = {
    id: todosModuleId,
    routes: todosRoutes,
    navigation: {
        title: "Todo lists",
        loader: loadLists,
        Component: ListsNavigation,
    },
    chat: {
        suggestions: ["Add a todo “Buy milk”", "What is due this week?", "Which lists do I have?"],
    },
};
