import type { AppModule } from "~/modules/types";

import { ListsNavigation } from "./components/ListsNavigation";
import { todosModuleId } from "./moduleId";
import { listRoute, listsRoute, todoRoute } from "./routes";

// The todos module (todo lists and todos), app shell part. Server part: module.server.ts; routes: routes.tsx (/lists, /lists/:listId,
// /lists/:listId/:todoId).
export const todosModule: AppModule = {
    id: todosModuleId,
    routes: [listsRoute, listRoute, todoRoute],
    navigation: {
        title: "Todo lists",
        Component: ListsNavigation,
    },
    chat: {
        suggestions: ["Add a todo “Buy milk”", "What is due this week?", "Which lists do I have?"],
    },
};
