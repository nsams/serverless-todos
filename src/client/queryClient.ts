import { QueryClient } from "@tanstack/react-query";

// The cache of the data loaded from the REST API (TanStack Query). The routes' loaders fill it (fetchQuery), the pages read it
// (useSuspenseQuery with the same query options), changes invalidate it (useRevalidate).
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Loaders always load fresh data on navigation, like a server-rendered page (fetchQuery refetches stale data). useSuspenseQuery
            // treats data as fresh for at least 1s, so a page doesn't refetch what its loader just loaded.
            staleTime: 0,
            // errors of the API are deterministic (e.g. a 404 or a validation error): no retries
            retry: false,
        },
    },
});
