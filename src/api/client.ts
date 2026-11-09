import { QueryClient, type QueryFilters } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import superjson from "superjson";

import { apiPath } from "./api";
import type { AppRouter } from "./router.server";

// The client of the app's API (src/api/router.server.ts), e.g. `await api.todos.create.mutate({ ... })`.
// Typed by the server's router (a type import only: no server code ends up in the browser).
export const api = createTRPCClient<AppRouter>({
    links: [
        // requests made at the same time (e.g. by the sidebar and the page) are sent as one request
        httpBatchLink({ url: apiPath, transformer: superjson, maxURLLength: 2000 }),
    ],
});

// The results of the procedures, e.g. ApiOutputs["lists"]["list"]
export type ApiOutputs = inferRouterOutputs<AppRouter>;

// e.g. a list that doesn't exist (anymore)
export function isNotFoundError(error: unknown) {
    return error instanceof TRPCClientError && (error.data as { code?: string } | undefined)?.code === "NOT_FOUND";
}

// Client errors (4xx, e.g. NOT_FOUND, BAD_REQUEST) aren't retried: they wouldn't succeed
function isClientError(error: unknown) {
    const status = error instanceof TRPCClientError ? (error.data as { httpStatus?: number } | undefined)?.httpStatus : undefined;
    return status !== undefined && status >= 400 && status < 500;
}

// The cache of the API's query results (TanStack Query). After a change the affected queries are invalidated
// (e.g. invalidateTodos in src/modules/todos/queries.ts), the ones shown are reloaded then.
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // data loaded shortly before isn't loaded again when another component needs it (e.g. the sidebar's lists on a list's page);
            // changes in the app invalidate the affected queries anyway
            staleTime: 30_000,
            retry: (failureCount, error) => !isClientError(error) && failureCount < 2,
        },
    },
});

// The API's procedures as TanStack Query options, typed by the server's router:
// `useQuery(trpc.lists.list.queryOptions())`, `queryClient.invalidateQueries(trpc.lists.pathFilter())`
export const trpc = createTRPCOptionsProxy<AppRouter>({ client: api, queryClient });

// Reloads the shown results of the queries after a change (the others are reloaded when they are shown the next time), e.g.
// invalidate(trpc.lists.pathFilter()); without filters all queries. A load that is already running may have missed the change
// (e.g. the sidebar's lists while the default list is created), so it is cancelled and started again.
export async function invalidate(...filters: QueryFilters[]) {
    const all = filters.length > 0 ? filters : [{}];
    await Promise.all(all.map((filter) => queryClient.cancelQueries(filter)));
    await Promise.all(all.map((filter) => queryClient.invalidateQueries(filter)));
}
