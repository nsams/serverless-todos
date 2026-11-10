import type { AppModule } from "~/modules/types";

import { ListsNavigation } from "./components/ListsNavigation";
import { todosModuleId } from "./moduleId";
import { listsQuery } from "./queries";

// The todos module (todo lists and todos), app shell part. Server part: module.server.ts; routes: routes/ (/lists, /lists/$listId).
export const todosModule: AppModule = {
    id: todosModuleId,
    navigation: {
        title: "Todo lists",
        prefetch: (queryClient) => queryClient.prefetchQuery(listsQuery),
        Component: ListsNavigation,
    },
    chat: {
        suggestions: ["Add a todo “Buy milk”", "What is due this week?", "Which lists do I have?"],
    },
};
