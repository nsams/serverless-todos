import { createBrowserRouter, replace } from "react-router";

import { appModules, startPath } from "~/modules/registry";

import { AppLayout, appLoader, PageErrorBoundary, shouldRevalidateApp } from "./AppLayout";
import { HydrateFallback, Root, RootErrorBoundary } from "./root";
import { appRouteId } from "./routeIds";

// The routes of the app (React Router, data mode): the start page, and the pages of the modules (AppModule.routes) in the app layout.
// The loaders load the page data from the REST API with the typed client (src/api/client.ts).
export const router = createBrowserRouter([
    {
        Component: Root,
        ErrorBoundary: RootErrorBoundary,
        HydrateFallback,
        children: [
            // start page: redirects to the start page of a module
            { index: true, loader: () => replace(startPath) },
            {
                id: appRouteId,
                Component: AppLayout,
                loader: appLoader,
                shouldRevalidate: shouldRevalidateApp,
                // errors of the pages are shown in the layout
                children: [{ ErrorBoundary: PageErrorBoundary, children: appModules.flatMap((module) => module.routes) }],
            },
        ],
    },
]);
