import { MutationCache, QueryClient, type QueryKey } from "@tanstack/react-query";
import { httpBatchLink, isTRPCClientError, type TRPCRequestOptions, TRPCUntypedClient } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import superjson from "superjson";

import { NotFoundError, ValidationError } from "~/errors";

import { apiPath } from "./api";
import type { CoreRouter } from "./router.server";

// The clients of the app's API (src/api/router.server.ts) as TanStack Query options: one per module, typed by the module's own router
// (a type import only: no server code ends up in the browser), e.g. `useQuery(todosApi.listLists.queryOptions())` and
// `useMutation(todosApi.createList.mutationOptions())` (src/modules/todos/api.ts). A module's client knows nothing of the other modules,
// and the app's router isn't a type anyone depends on.

declare module "@tanstack/react-query" {
    interface Register {
        mutationMeta: {
            // the queries a mutation changes (reloaded after it); without: all queries of its module
            invalidates?: QueryKey[];
        };
    }
}

// One link for all clients: requests made at the same time (e.g. by the sidebar and the page) are sent as one request
const batchLink = httpBatchLink({ url: apiPath, transformer: superjson, maxURLLength: 2000 })({});

class ApiClient<Router extends AnyRouter> extends TRPCUntypedClient<Router> {
    // pathPrefix: where the router is mounted, e.g. "todos." (procedure todos.createList)
    constructor(private readonly pathPrefix: string) {
        super({ links: [() => batchLink] });
    }

    override query(path: string, input?: unknown, opts?: TRPCRequestOptions) {
        return withOperationErrors(super.query(this.pathPrefix + path, input, opts));
    }

    override mutation(path: string, input?: unknown, opts?: TRPCRequestOptions) {
        return withOperationErrors(super.mutation(this.pathPrefix + path, input, opts));
    }
}

// The operations' errors (src/errors.ts) as the API reports them (src/api/trpc.server.ts) become those errors again, so the app handles
// them independently of tRPC: a form shows a ValidationError's message (errorMessage), a page shows a NotFoundError as 404.
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

// The key all queries and mutations of a module start with (the clients' keyPrefix: [[moduleId], [procedure], { input }]), so a change
// reloads exactly the data of its module
export function moduleKey(moduleId: string): QueryKey {
    return [[moduleId]];
}

// Reloads the data of modules: the queries shown right away, the others when they are shown again. After every mutation (see
// mutationCache below) and after the assistant changed data (src/components/ChatPanel.tsx).
export async function invalidateModules(moduleIds: string[]) {
    await Promise.all(moduleIds.map((moduleId) => queryClient.invalidateQueries({ queryKey: moduleKey(moduleId) })));
}

// Errors that don't go away by trying again: the entity doesn't exist, invalid input, other 4xx (e.g. an expired login)
function isClientError(error: Error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
        return true;
    }
    const status = isTRPCClientError<CoreRouter>(error) ? error.data?.httpStatus : undefined;
    return status !== undefined && status >= 400 && status < 500;
}

// The cache of the API's results (TanStack Query)
export const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // data loaded shortly before isn't loaded again when another component needs it (e.g. the sidebar's lists on a list's page);
            // every change invalidates the queries it affects anyway
            staleTime: 30_000,
            retry: (failureCount, error) => !isClientError(error) && failureCount < 2,
        },
    },
    // After every mutation (also a failed one: the UI shows the stored state again, e.g. the done checkbox of a todo) the queries it
    // changes are reloaded: those of its module (the module id is its key's prefix), or the ones in its meta.invalidates. Awaited, so
    // the mutation's promise resolves once the reloaded data is shown. The mutation's own onSuccess runs before, e.g. to leave the page
    // of a deleted list first (it would be loaded again otherwise).
    mutationCache: new MutationCache({
        onSettled: async (_data, error, _variables, _context, mutation) => {
            // invalid input changed nothing
            if (error instanceof ValidationError) {
                return;
            }
            const keys = mutation.meta?.invalidates ?? moduleKeyOf(mutation.options.mutationKey);
            await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
        },
    }),
});

function moduleKeyOf(mutationKey: QueryKey | undefined) {
    const [prefix] = mutationKey ?? [];
    return Array.isArray(prefix) && typeof prefix[0] === "string" ? [moduleKey(prefix[0])] : [];
}

// The client of a module's router (mounted under the module's id), e.g. `todosApi.listTodos.queryOptions({ listId })`
export function createModuleApi<Router extends AnyRouter>(moduleId: string) {
    return createTRPCOptionsProxy<Router, { keyPrefix: true }>({ client: new ApiClient<Router>(`${moduleId}.`), queryClient, keyPrefix: moduleId });
}

// The client of the core's procedures, e.g. `useQuery(coreApi.user.queryOptions())`
export const coreApi = createTRPCOptionsProxy<CoreRouter>({ client: new ApiClient<CoreRouter>(""), queryClient });
