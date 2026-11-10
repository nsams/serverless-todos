import { QueryClient, type QueryFilters } from "@tanstack/react-query";
import { createTRPCClientProxy, httpBatchLink, isTRPCClientError, type TRPCClient, type TRPCRequestOptions, TRPCUntypedClient } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import { createTRPCOptionsProxy, type TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import superjson from "superjson";

import { NotFoundError, ValidationError } from "~/errors";

import { apiPath } from "./api";
import type { CoreRouter } from "./router.server";

// The clients of the app's API (src/api/router.server.ts): one per module, typed by the module's own router (a type import only: no server
// code ends up in the browser), e.g. todosApi (src/modules/todos/api.ts). A module's client knows nothing of the other modules, and the
// app's router isn't a type anyone depends on. One object per module for both ways of using a procedure:
// - TanStack Query options, e.g. `todosApi.listTodos.queryOptions({ listId })` for a loader's fetchQuery and the page's useSuspenseQuery,
// - calls, e.g. `await todosApi.createList.mutate({ name })`.

// The cache of the API's query results (TanStack Query): the route loaders fill it, the pages read from it, a change reloads the queries
// of its module (src/moduleQueries.ts)
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // changes made in the app (UI, assistant) reload their module's data right away; this is for changes made elsewhere
            // (another tab, an MCP client): reloaded when a page using the data is opened or the window is focused again
            staleTime: 30_000,
            // e.g. a list that doesn't exist (anymore) or invalid input: retrying doesn't help
            retry: (failureCount, error) => failureCount < 2 && !isClientError(error),
        },
    },
});

class ApiClient extends TRPCUntypedClient<AnyRouter> {
    override query(path: string, input?: unknown, opts?: TRPCRequestOptions) {
        return withOperationErrors(super.query(path, input, opts));
    }

    override mutation(path: string, input?: unknown, opts?: TRPCRequestOptions) {
        return withOperationErrors(super.mutation(path, input, opts));
    }
}

const client = new ApiClient({
    // requests made at the same time (e.g. by the loaders of a page and the sidebar) are sent as one request
    links: [httpBatchLink({ url: apiPath, transformer: superjson, maxURLLength: 2000 })],
});

// tRPC's proxies of the whole API, untyped here: every property is a path segment (todos → listTodos → queryOptions)
const callProxy = createTRPCClientProxy(client) as unknown as ProxyNode;
const optionsProxy = createTRPCOptionsProxy({ client, queryClient }) as unknown as ProxyNode;

export type Api<Router extends AnyRouter> = TRPCClient<Router> & TRPCOptionsProxy<Router>;

// The client of a module's router, which is mounted under the module's id: the keys of its queries start with the module's id
// (e.g. [["todos", "listTodos"], { input }]), so a change reloads the module's queries by its id (moduleQueryFilter)
export function createModuleApi<Router extends AnyRouter>(moduleId: string): Api<Router> {
    return combine(callProxy[moduleId], optionsProxy[moduleId]) as unknown as Api<Router>;
}

// The client of the core's procedures, e.g. `api.user.queryOptions()`
export const api = combine(callProxy, optionsProxy) as unknown as Api<CoreRouter>;

// All queries of a module, e.g. to reload them; the same as e.g. todosApi.pathFilter()
export function moduleQueryFilter(moduleId: string): QueryFilters {
    return { queryKey: [[moduleId]] };
}

type ProxyNode = ((...args: unknown[]) => unknown) & { [segment: string]: ProxyNode };

// The methods of tRPC's client proxy; anything else (queryOptions, mutationOptions, queryKey, pathFilter, ...) is the options proxy's
const callMethods = new Set(["query", "mutate"]);

// A proxy that follows a path in both proxies and calls the method in the one it belongs to
function combine(calls: ProxyNode, options: ProxyNode): ProxyNode {
    return new Proxy(options, {
        get: (_target, segment) => {
            // not a thenable (like tRPC's own proxies): e.g. returning a client from an async function must not await it
            if (typeof segment !== "string" || segment === "then") {
                return undefined;
            }
            return callMethods.has(segment) ? calls[segment] : combine(calls[segment], options[segment]);
        },
    });
}

// The operations' errors (src/errors.ts) as the API reports them (src/api/trpc.server.ts) become those errors again, so the app handles
// them independently of tRPC: a form shows a ValidationError's message (errorMessage), a loader turns a NotFoundError into a 404 page.
async function withOperationErrors<T>(promise: Promise<T>) {
    try {
        return await promise;
    } catch (error) {
        if (isTRPCClientError<CoreRouter>(error)) {
            if (error.data?.code === "NOT_FOUND") {
                throw new NotFoundError(error.message, { cause: error });
            }
            if (error.data?.code === "BAD_REQUEST") {
                throw new ValidationError(error.message, { cause: error });
            }
        }
        throw error;
    }
}

function isClientError(error: unknown) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
        return true;
    }
    const httpStatus = isTRPCClientError<CoreRouter>(error) ? error.data?.httpStatus : undefined;
    return httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500;
}
