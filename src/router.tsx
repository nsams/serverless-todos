import { createRouter } from "@tanstack/react-router";

import { queryClient, trpc } from "./api/query";
import { RouteError, RouteNotFound } from "./components/RouteError";
import { routeTree } from "./routeTree.gen";
import { parseSearch, stringifySearch } from "./searchParams";

// The app's router (TanStack Router, client-side only): the route tree is generated from the route files (src/routes.ts) into
// src/routeTree.gen.ts. The loaders load the page data from the API into the query cache (context: src/api/query.ts).
export const router = createRouter({
    routeTree,
    context: { queryClient, trpc },
    parseSearch,
    stringifySearch,
    scrollRestoration: true,
    // the data of a link's page is loaded on hover/focus; the query cache decides whether it is loaded again (staleTime)
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // 404 (unknown path, or e.g. a list that doesn't exist (anymore)) and errors are shown in place of the route's page, i.e. within the app layout
    defaultNotFoundComponent: RouteNotFound,
    defaultErrorComponent: RouteError,
});

// Registers the router's type: links, navigate, redirect, route ids, params and search params are checked against the route tree
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
