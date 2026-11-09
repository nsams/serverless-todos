import { useQueryClient } from "@tanstack/react-query";
import { notFound, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import { isNotFoundError } from "~/api/client";
import { appName } from "~/app";

// Helpers for the routes (TanStack Router, see src/router.tsx, src/routes.ts)

// Loads a page's data in a route's loader; a NOT_FOUND error of the API (e.g. a list that doesn't exist (anymore)) becomes a 404 of
// the route (its notFoundComponent, by default RouteNotFound in src/components/RouteError.tsx)
export async function loadOrNotFound<T>(promise: Promise<T>) {
    try {
        return await promise;
    } catch (error) {
        if (isNotFoundError(error)) {
            throw notFound();
        }
        throw error;
    }
}

// Reloads the data after a change (e.g. an API mutation, a tool of the chat assistant): marks all cached query results as outdated and
// runs the loaders of the current page again, which load the outdated ones (the page's data and the sidebar's navigation data) in one
// batched request. As the loaders run, a page that doesn't exist anymore becomes a 404 and an empty grid page redirects (lastPageWithRows).
// Other cached results are loaded again when they are used next.
// navigate: goes to another page after the change (e.g. the created item), whose loaders then load the outdated data instead
export function useRefresh() {
    const queryClient = useQueryClient();
    const router = useRouter();
    return useCallback(
        async (navigate?: () => Promise<void>) => {
            await queryClient.invalidateQueries({ refetchType: "none" });
            await (navigate ? navigate() : router.invalidate());
        },
        [queryClient, router],
    );
}

// The page title for a route's head, e.g. "Work – Todos"; without a name (e.g. a 404) just the app name
export function pageTitle(name: string | undefined) {
    return { meta: [{ title: name ? `${name} – ${appName}` : appName }] };
}
