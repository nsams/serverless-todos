import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import { parseSearch, stringifySearch } from "./searchParams";

export function getRouter() {
    return createRouter({
        routeTree,
        parseSearch,
        stringifySearch,
        scrollRestoration: true,
    });
}

declare module "@tanstack/react-router" {
    interface Register {
        router: ReturnType<typeof getRouter>;
    }
}
