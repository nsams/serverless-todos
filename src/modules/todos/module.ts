import type { AppModule } from "~/modules/types";
import { NoContent } from "~/routes/root";

import { todosModuleId } from "./moduleId";
import { listsNavigation } from "./navigation";
import { listRoute, listsRoute } from "./routes";

// The todos module (todo lists and todos), app shell part. Server part: module.server.ts; routes: routes.ts (/lists, /lists/:listId).
export const todosModule: AppModule = {
    id: todosModuleId,
    routes: [
        // only redirects
        { ...listsRoute.route, Component: NoContent },
        // the page is loaded with the route (code splitting), its loader doesn't wait for it
        { ...listRoute.route, lazy: () => import("./pages/list") },
    ],
    navigation: listsNavigation,
    chat: {
        suggestions: ["Add a todo “Buy milk”", "What is due this week?", "Which lists do I have?"],
    },
};
