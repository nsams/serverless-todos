import { createFileRoute, notFound } from "@tanstack/react-router";

// Any path that isn't a page of a module: a 404 within the app layout (RouteNotFound, see src/router.tsx)
export const Route = createFileRoute("/_app/$")({
    loader: () => {
        throw notFound();
    },
});
