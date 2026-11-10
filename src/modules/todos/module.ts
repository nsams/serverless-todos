import type { AppModule } from "~/modules/types";

import { ListsNavigation } from "./components/ListsNavigation";
import { todosModuleId } from "./moduleId";
import { listsNavigation } from "./navigation";
import { listRoute, listsRoute } from "./routes";

// The todos module (todo lists and todos), app shell part. Server part: module.server.ts (REST API: api.server.ts);
// pages: routes.ts (/lists, /lists/:listId).
export const todosModule: AppModule = {
    id: todosModuleId,
    // the pages' code is loaded when they are opened (in parallel with their loader's data)
    routes: [listsRoute.route, { ...listRoute.route, lazy: { Component: async () => (await import("./pages/ListPage")).ListPage } }],
    navigation: {
        title: "Todo lists",
        data: listsNavigation,
        Component: ListsNavigation,
    },
    chat: {
        suggestions: ["Add a todo “Buy milk”", "What is due this week?", "Which lists do I have?"],
    },
};
