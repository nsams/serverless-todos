import { QueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";

import { api } from "./client";
import type { AppRouter } from "./router.server";

// The cache of the API's query results (TanStack Query): the route loaders fill it (queryClient.fetchQuery), the pages read from it
// (useSuspenseQuery), a change invalidates it (useRefresh in src/routing.ts).
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // A loader's result is fresh for the page that renders it right after (no second request) and e.g. when going back to a page
            // shortly after; changes made in the app invalidate the cache anyway, so this only delays changes made elsewhere (e.g. by an MCP
            // client), which are also loaded when the window gets the focus again
            staleTime: 30_000,
            // e.g. a list that doesn't exist (anymore) or invalid input: retrying doesn't help
            retry: (failureCount, error) => failureCount < 2 && !isClientError(error),
        },
    },
});

// The API's procedures as TanStack Query options, typed by the server's router, e.g. trpc.lists.list.queryOptions(),
// trpc.todos.list.queryOptions({ listId }), trpc.lists.list.queryKey()
export const trpc = createTRPCOptionsProxy<AppRouter>({ client: api, queryClient });

// The context of the routes (src/router.tsx): route loaders load their data with it, e.g.
// `loader: ({ context: { queryClient, trpc } }) => queryClient.fetchQuery(trpc.lists.list.queryOptions())`
export type RouterContext = { queryClient: QueryClient; trpc: typeof trpc };

function isClientError(error: unknown) {
    const httpStatus = error instanceof TRPCClientError ? (error.data as { httpStatus?: number } | undefined)?.httpStatus : undefined;
    return httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500;
}
