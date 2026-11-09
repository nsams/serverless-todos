import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import superjson from "superjson";

import { apiPath } from "./api";
import type { AppRouter } from "./router.server";

// The client of the app's API (src/api/router.server.ts), e.g. `await api.lists.list.query()`, `await api.todos.create.mutate({ ... })`.
// Typed by the server's router (a type import only: no server code ends up in the browser).
export const api = createTRPCClient<AppRouter>({
    links: [
        // requests made at the same time (e.g. by the loaders of a page) are sent as one request
        httpBatchLink({ url: apiPath, transformer: superjson, maxURLLength: 2000 }),
    ],
});

// The results of the procedures, e.g. ApiOutputs["lists"]["list"]
export type ApiOutputs = inferRouterOutputs<AppRouter>;

// e.g. a list that doesn't exist (anymore)
export function isNotFoundError(error: unknown) {
    return error instanceof TRPCClientError && (error.data as { code?: string } | undefined)?.code === "NOT_FOUND";
}
