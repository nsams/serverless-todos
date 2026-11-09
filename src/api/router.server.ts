import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import type { User } from "~/auth.server";
import { moduleApis } from "~/modules/registry.server";

import { apiPath } from "./api";
import { procedure, router } from "./trpc.server";

// The API of the app: core procedures and the procedures of the modules (e.g. lists.*, todos.* of the todos module)
const appRouter = router({
    // the authenticated user
    user: procedure.query(({ ctx: { user } }) => user),
    ...moduleApis,
});

// used by the client (src/api/client.ts) for the types of the procedures
export type AppRouter = typeof appRouter;

// Handles a request to /api/* of an authenticated user (src/server.ts)
export function handleApiRequest(request: Request, user: User) {
    return fetchRequestHandler({
        endpoint: apiPath,
        req: request,
        router: appRouter,
        createContext: () => ({ user }),
        onError: ({ error, path }) => {
            if (error.code === "INTERNAL_SERVER_ERROR") {
                console.error(`API error in ${path ?? "unknown procedure"}`, error.cause ?? error);
            }
        },
    });
}
