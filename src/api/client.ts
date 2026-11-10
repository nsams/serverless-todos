import { createTRPCClientProxy, httpBatchLink, isTRPCClientError, type TRPCClient, type TRPCRequestOptions, TRPCUntypedClient } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import superjson from "superjson";

import { NotFoundError, ValidationError } from "~/errors";

import { apiPath } from "./api";
import type { CoreRouter } from "./router.server";

// The clients of the app's API (src/api/router.server.ts): one per module, typed by the module's own router (a type import only: no server
// code ends up in the browser), e.g. `await todosApi.createList.mutate({ name })` (src/modules/todos/api.ts). A module's client knows
// nothing of the other modules, and the app's router isn't a type anyone depends on.

// One link for all clients: requests made at the same time (e.g. by the loaders of a page and the sidebar) are sent as one request
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

// The client of a module's router (mounted under the module's id)
export function createModuleClient<Router extends AnyRouter>(moduleId: string): TRPCClient<Router> {
    return createTRPCClientProxy(new ApiClient<Router>(`${moduleId}.`));
}

// The client of the core's procedures, e.g. `await api.user.query()`
export const api: TRPCClient<CoreRouter> = createTRPCClientProxy(new ApiClient<CoreRouter>(""));

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
