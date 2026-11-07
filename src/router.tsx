import { createRouter } from "@tanstack/react-router";

import { ErrorComponent, NotFoundComponent } from "./components/ErrorMessage";
import { routeTree } from "./routeTree.gen";
import { parseSearch, stringifySearch } from "./searchParams";

export function getRouter() {
    return createRouter({
        routeTree,
        parseSearch,
        stringifySearch,
        scrollRestoration: true,
        // defaults for every route: the same components are rendered on the server and the client
        defaultErrorComponent: ErrorComponent,
        defaultNotFoundComponent: NotFoundComponent,
    });
}

declare module "@tanstack/react-router" {
    interface Register {
        router: ReturnType<typeof getRouter>;
    }
}
