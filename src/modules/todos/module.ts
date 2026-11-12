import type { AppModule } from "~/modules/types";
import { NoContent } from "~/routes/root";

import { todosModuleId } from "./moduleId";
import { listsNavigation } from "./navigation";
import { listRoute, listsRoute, todoRoute } from "./routes";

// The todos module (todo lists and todos), app shell part. Server part: module.server.ts; routes: routes.ts (/lists, /lists/:listId,
// /lists/:listId/:todoId).
export const todosModule: AppModule = {
    id: todosModuleId,
    routes: [
        // only redirects
        { ...listsRoute.route, Component: NoContent },
        // the pages are loaded with their route (code splitting), the loaders don't wait for them
        { ...listRoute.route, lazy: () => import("./pages/list") },
        { ...todoRoute.route, lazy: () => import("./pages/todo") },
    ],
    navigation: listsNavigation,
    chat: {
        suggestions: ["Add a todo “Buy milk”", "What is due this week?", "Which lists do I have?"],
    },
};
