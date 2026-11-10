import { parseResponse } from "hono/client";
import { lazy } from "react";

import { defaultCollectionPage } from "~/components/DefaultRedirect";
import type { AppModule } from "~/modules/types";

import { todosClient } from "./api";
import { ListsNavigation } from "./components/ListsNavigation";
import { todosModuleId } from "./moduleId";
import { listsQuery } from "./queries";
import { listRoute, listsRoute } from "./routes";

// The todos module (todo lists and todos), app shell part. Server part: module.server.ts (REST API: api.server.ts);
// pages: routes.ts (/lists, /lists/:listId).
export const todosModule: AppModule = {
    id: todosModuleId,
    pages: [
        {
            path: listsRoute.path,
            Component: defaultCollectionPage({
                moduleId: todosModuleId,
                collectionsQuery: listsQuery,
                createDefault: () => parseResponse(todosClient.lists.default.$post()),
                href: (listId) => listRoute.href({ listId }),
            }),
        },
        // the page's code is loaded when it is opened
        { path: listRoute.path, Component: lazy(() => import("./pages/ListPage")) },
    ],
    navigation: {
        title: "Todo lists",
        Component: ListsNavigation,
    },
    chat: {
        suggestions: ["Add a todo “Buy milk”", "What is due this week?", "Which lists do I have?"],
    },
};
