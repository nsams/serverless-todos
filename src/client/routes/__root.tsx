import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import { PageNotFound } from "../errors";

// Available in the loaders of all routes (router.tsx)
export type RouterContext = { queryClient: QueryClient };

// The root route: every page (the theme, the error snackbar and the query client are set up in main.tsx, around the router)
export const Route = createRootRouteWithContext<RouterContext>()({
    component: Outlet,
    // unknown paths (see notFoundMode in router.tsx)
    notFoundComponent: PageNotFound,
});
