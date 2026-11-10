import type { AppModule } from "~/modules/types";

import { ListsNavigation } from "./components/ListsNavigation";
import { todosModuleId } from "./moduleId";
import { listsNavigation } from "./navigation";
import { ListPage } from "./pages/ListPage";
import { listRoute, listsRoute } from "./routes";

// The todos module (todo lists and todos), app shell part. Server part: module.server.ts (REST API: api.server.ts);
// pages: routes.ts (/lists, /lists/:listId).
export const todosModule: AppModule = {
    id: todosModuleId,
    routes: [listsRoute.route, { ...listRoute.route, Component: ListPage }],
    navigation: {
        title: "Todo lists",
        data: listsNavigation,
        Component: ListsNavigation,
    },
    chat: {
        suggestions: ["Add a todo “Buy milk”", "What is due this week?", "Which lists do I have?"],
    },
};
