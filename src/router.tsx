import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { RouteError, RouteNotFound } from "./components/RouteError";
import { NotFoundError } from "./errors";
import { routeTree } from "./routeTree.gen";
import { parseSearch, stringifySearch } from "./searchParams";

// The data of the pages lives in TanStack Query's cache (the modules' queries.ts, loaded with the modules' API clients): the route
// loaders fill it, the components read it, a change reloads exactly the data of its module (src/moduleQueries.ts)
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // changes made in the app (UI, assistant) reload their module's data right away; this is for changes made elsewhere
            // (another tab, an MCP client): reloaded when a page using the data is opened or the window is focused again
            staleTime: 30_000,
            // a page whose data doesn't exist (anymore) shows its not found page right away, not after the retries: e.g. a note deleted
            // by the assistant while open (usePageQuery)
            retry: (failureCount, error) => !(error instanceof NotFoundError) && failureCount < 3,
        },
    },
});

// The app's router (TanStack Router, client-side only): the route tree is generated from the route files (src/routes.ts) into
// src/routeTree.gen.ts. The loaders load the page data from the API into the query cache, the pages read it from there.
export const router = createRouter({
    routeTree,
    context: { queryClient },
    // search params as plain URLSearchParams instead of JSON values (e.g. ?sort=title:asc&sort=done:desc), also the query of the API
    parseSearch,
    stringifySearch,
    scrollRestoration: true,
    // loads the data of a page when a link to it is hovered (the loaders don't change data)
    defaultPreload: "intent",
    // the loaders get their data from the query cache (fetchQuery): the queries decide whether it is fresh
    defaultPreloadStaleTime: 0,
    // 404 (an unknown path, or e.g. a list that doesn't exist (anymore)) and errors are shown in place of the route's page, i.e. within
    // the app layout
    defaultNotFoundComponent: RouteNotFound,
    defaultErrorComponent: RouteError,
});

// The context of the routes: their loaders load the data into the query cache, e.g.
// `loader: ({ context: { queryClient } }) => queryClient.fetchQuery(listsQuery)`
export type RouterContext = { queryClient: QueryClient };

// Registers the router's type: links, navigate, redirect, route ids, params and search params are checked against the route tree
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
