import { createBrowserRouter, type RouteObject } from "react-router";

import { moduleRoutes, moduleShouldRevalidate } from "./moduleData";
import { appModules } from "./modules/registry";
import { appLayoutRoute } from "./routes/app";
import { indexLoader } from "./routes/index";
import { InitialLoading, NoContent, Root, RouteError } from "./routes/root";

// The app's routes (React Router data mode): the pages of the modules (AppModule.routes, src/modules/registry.ts) in the app layout.
// The loaders load the page data from the API (e.g. src/modules/todos/api.ts); after a change the changed modules' loaders run again
// (src/moduleData.ts).

// The pages; their errors are shown in the app layout
const pages: RouteObject = {
    ErrorBoundary: RouteError,
    children: [...appModules.flatMap((module) => moduleRoutes(module.id, module.routes)), { path: "*", loader: notFound, Component: NoContent }],
};

// Above the pages: a pathless route per module that loads the module's navigation data (src/navigation.tsx), so the loaders of all modules
// run in parallel (one API request, see src/api/client.ts) and each is reloaded only after a change of its module
const navigationRoutes = appModules.reduceRight<RouteObject[]>(
    (children, { id, navigation }) =>
        navigation ? [{ ...navigation.route, shouldRevalidate: moduleShouldRevalidate(id, false), children }] : children,
    [pages],
);

export const router = createBrowserRouter([
    {
        Component: Root,
        HydrateFallback: InitialLoading,
        ErrorBoundary: RouteError,
        children: [
            { index: true, loader: indexLoader, Component: NoContent },
            { ...appLayoutRoute, children: navigationRoutes },
        ],
    },
]);

function notFound(): never {
    throw new Response(null, { status: 404 });
}
