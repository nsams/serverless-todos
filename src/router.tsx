import type { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { queryClient } from "./api/client";
import { RouteError, RouteNotFound } from "./components/RouteError";
import { routeTree } from "./routeTree.gen";
import { parseSearch, stringifySearch } from "./searchParams";

// The app's router (TanStack Router, client-side only): the route tree is generated from the route files (src/routes.ts) into
// src/routeTree.gen.ts. The loaders load the page data from the API into the query cache (src/api/client.ts), the pages read it from there.
export const router = createRouter({
    routeTree,
    context: { queryClient },
    parseSearch,
    stringifySearch,
    scrollRestoration: true,
    // loads the data of a page when a link to it is hovered (the loaders don't change data)
    defaultPreload: "intent",
    // the loaders get their data from the query cache (fetchQuery): the queries decide whether it is fresh
    defaultPreloadStaleTime: 0,
    // 404 (unknown path, or e.g. a list that doesn't exist (anymore)) and errors are shown in place of the route's page, i.e. within the app layout
    defaultNotFoundComponent: RouteNotFound,
    defaultErrorComponent: RouteError,
});

// The context of the routes: their loaders load the data into the query cache, e.g.
// `loader: ({ context: { queryClient } }) => queryClient.fetchQuery(todosApi.listLists.queryOptions())`
export type RouterContext = { queryClient: QueryClient };

// Registers the router's type: links, navigate, redirect, route ids, params and search params are checked against the route tree
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
