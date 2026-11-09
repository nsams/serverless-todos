import type { RouteObject } from "react-router";

import { NoContent } from "~/routes/root";

import { listRouteId } from "./paths";
import { defaultListLoader } from "./routes/defaultList";
import { listLoader, ListPage } from "./routes/list";

// The module's pages, mounted into the app layout
export const todosRoutes: RouteObject[] = [
    {
        path: "lists",
        children: [
            // redirects to the user's first list
            { index: true, loader: defaultListLoader, Component: NoContent },
            { id: listRouteId, path: ":listId", loader: listLoader, Component: ListPage },
        ],
    },
];
