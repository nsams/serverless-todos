import { createRootRouteWithContext, HeadContent, Outlet } from "@tanstack/react-router";

import type { RouterContext } from "~/api/query";
import { pageTitle } from "~/routing";

// Root route of the app (src/routes.ts); the providers (theme, error snackbar, query client) are set up in src/main.tsx
export const Route = createRootRouteWithContext<RouterContext>()({
    head: () => pageTitle(undefined),
    component: Root,
});

function Root() {
    return (
        <>
            {/* the head tags of the current routes (the page title); React moves them into the document's head */}
            <HeadContent />
            <Outlet />
        </>
    );
}
