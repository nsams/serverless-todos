import { createBrowserRouter, type RouteObject } from "react-router";

import { appModules, startRoute } from "~/modules/registry";
import type { AppModule } from "~/modules/types";

import { AppLayout, appLoader, PageErrorBoundary } from "./AppLayout";
import { HydrateFallback, Root, RootErrorBoundary } from "./root";
import { moduleShouldRevalidate } from "./routing";

// The routes of the app (React Router, data mode): the start page, and the pages of the modules (AppModule.routes) in the app layout.
// The loaders load the page data from the REST API with the modules' typed clients (e.g. src/modules/todos/api.ts).
const moduleRoutes = appModules.flatMap((module) => module.routes.map((route) => withModule(module, route)));

// Pages that only redirect (a loader without a component, e.g. /lists to the user's first list), like the start page: outside the app
// layout, so its data (the user, the navigation) is loaded once, for the page they redirect to (on the initial load React Router runs
// every loader again after a redirect)
const isRedirect = (route: RouteObject) => !route.Component && !route.element && !route.lazy && !route.children;

export const router = createBrowserRouter([
    {
        Component: Root,
        ErrorBoundary: RootErrorBoundary,
        HydrateFallback,
        children: [
            // start page: redirects to a module's page
            { index: true, loader: startRoute.route.loader },
            ...moduleRoutes.filter(isRedirect),
            {
                Component: AppLayout,
                loader: appLoader,
                // the user doesn't change
                shouldRevalidate: () => false,
                children: withNavigationData(appModules, [
                    // errors of the pages are shown in the layout
                    {
                        ErrorBoundary: PageErrorBoundary,
                        children: moduleRoutes.filter((route) => !isRedirect(route)),
                    },
                ]),
            },
        ],
    },
]);

// A module's route (and its children) is reloaded with the module's data (moduleShouldRevalidate)
function withModule(module: AppModule, route: RouteObject): RouteObject {
    const shouldRevalidate = moduleShouldRevalidate(module.id, route.shouldRevalidate);
    return route.index
        ? { ...route, shouldRevalidate }
        : { ...route, shouldRevalidate, children: route.children?.map((child) => withModule(module, child)) };
}

// The modules' navigation data (e.g. the lists in the sidebar), each loaded by a pathless route of its own around the pages, so it is
// reloaded with its module's data only, not by navigations between the pages (the app layout renders the sidebar, the module reads
// it with useData, see defineNavigationData)
function withNavigationData(modules: AppModule[], pages: RouteObject[]) {
    return modules.reduceRight<RouteObject[]>((children, { id, navigation }) => {
        if (!navigation) {
            return children;
        }
        const route: RouteObject = {
            id: navigation.data.id,
            loader: navigation.data.loader,
            shouldRevalidate: moduleShouldRevalidate(id, () => false),
            children,
        };
        return [route];
    }, pages);
}
