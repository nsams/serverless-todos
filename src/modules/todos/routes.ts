import { parseResponse } from "hono/client";
import { generatePath, replace, type RouteObject } from "react-router";

import { api } from "~/api/client";

import { listPath, listsPath } from "./paths";
import { listLoader, ListPage } from "./routes/ListPage";

// The module's pages (ids: their paths, see paths.ts)
export const todosRoutes: RouteObject[] = [
    {
        // the user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts)
        id: listsPath,
        path: listsPath,
        loader: async () => {
            const { id } = await parseResponse(api.lists.default.$post());
            return replace(generatePath(listPath, { listId: id }));
        },
    },
    { id: listPath, path: listPath, loader: listLoader, Component: ListPage },
];
