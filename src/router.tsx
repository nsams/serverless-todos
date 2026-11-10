import { isServer, QueryClient } from "@tanstack/react-query";
import { createRouter, isNotFound } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { routeTree } from "./routeTree.gen";
import { parseSearch, stringifySearch } from "./searchParams";

export function getRouter() {
    // The data of the pages lives in TanStack Query's cache (the modules' queries.ts): the route loaders fill it, the components read
    // it, a change reloads exactly the data of its module (src/moduleQueries.ts)
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                // changes made in the app (UI, assistant) reload their module's data right away; this is for changes made elsewhere
                // (another tab, an MCP client): reloaded when a page using the data is opened or the window is focused again
                staleTime: 30_000,
                // Like the default (3 retries in the browser, none on the server), but a page whose data doesn't exist (anymore) shows
                // its not found page right away, not after the retries: e.g. a note deleted by the assistant while open (usePageQuery)
                retry: (failureCount, error) => !isServer && !isNotFound(error) && failureCount < 3,
            },
        },
    });
    const router = createRouter({
        routeTree,
        context: { queryClient },
        parseSearch,
        stringifySearch,
        scrollRestoration: true,
        // loads the data of a page when a link to it is hovered (the loaders don't change data)
        defaultPreload: "intent",
        // the loaders get their data from the query cache (fetchQuery): the queries decide whether it is fresh
        defaultPreloadStaleTime: 0,
    });
    // provides the QueryClient, sends the queries loaded on the server to the browser
    setupRouterSsrQueryIntegration({ router, queryClient });
    return router;
}

export type RouterContext = { queryClient: QueryClient };

declare module "@tanstack/react-router" {
    interface Register {
        router: ReturnType<typeof getRouter>;
    }
}
