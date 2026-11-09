import { createBrowserRouter } from "react-router";

import { appRouteId } from "./modules/navigation";
import { appModules } from "./modules/registry";
import { AppLayout, appLoader, shouldRevalidateApp } from "./routes/app";
import { indexLoader } from "./routes/index";
import { InitialLoading, NoContent, Root, RouteError } from "./routes/root";

// The app's routes (React Router data mode): the pages of the modules (AppModule.routes, src/modules/registry.ts) in the app layout.
// The loaders load the page data from the API (src/api/client.ts); after a change the page data is reloaded with useRevalidator.
export const router = createBrowserRouter([
    {
        Component: Root,
        HydrateFallback: InitialLoading,
        ErrorBoundary: RouteError,
        children: [
            { index: true, loader: indexLoader, Component: NoContent },
            {
                id: appRouteId,
                loader: appLoader,
                shouldRevalidate: shouldRevalidateApp,
                Component: AppLayout,
                children: [
                    {
                        // errors of the pages are shown in the app layout
                        ErrorBoundary: RouteError,
                        children: [...appModules.flatMap((module) => module.routes), { path: "*", loader: notFound, Component: NoContent }],
                    },
                ],
            },
        ],
    },
]);

function notFound(): never {
    throw new Response(null, { status: 404 });
}
