import { createRouter } from "@tanstack/react-router";

import { parseSearch, stringifySearch } from "~/searchParams";

import { PageErrorMessage } from "./errors";
import { queryClient } from "./queryClient";
import { routeTree } from "./routeTree.gen";

// The router of the app (TanStack Router, client-side only): the route tree is generated from the route files (src/client/routes.ts).
// The loaders load the page data from the REST API (typed client, src/api/client.ts) into the query cache (context.queryClient).
export const router = createRouter({
    routeTree,
    context: { queryClient },
    // search params as plain URLSearchParams instead of JSON values (also used as query of the API client)
    parseSearch,
    stringifySearch,
    scrollRestoration: true,
    // the query cache decides about reloading the data (the loaders use fetchQuery), so preloaded loader results aren't kept
    defaultPreloadStaleTime: 0,
    // errors of a route (thrown by its loader or while rendering) replace the route's component, e.g. a page's error is shown
    // in the app layout; errors of the app layout itself in place of the layout
    defaultErrorComponent: PageErrorMessage,
    // Unknown paths are shown by the root route (without the app layout). Otherwise the deepest partly matching route would show
    // them, e.g. the list page for /lists/<id>/unknown. A not-found thrown by a loader is shown by its route, see PageNotFound.
    notFoundMode: "root",
});

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
