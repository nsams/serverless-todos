import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import type { User } from "~/auth.server";
import { moduleRouters } from "~/modules/registry.server";

import { apiPath } from "./api";
import { mergeRouters, procedure, router } from "./trpc.server";

// The core's procedures (client: api in src/api/client.ts)
const coreRouter = router({
    // the authenticated user
    user: procedure.query(({ ctx: { user } }) => user),
});

export type CoreRouter = typeof coreRouter;

// The API of the app: the core's procedures and the router of every module under the module's id (e.g. todos.createList; a module id
// that is also the name of a core procedure throws). Composed at runtime: the clients are typed by their own router (CoreRouter, the
// modules' routers), not by this one, so a module is added without touching this file.
const appRouter = mergeRouters(coreRouter, router(moduleRouters));

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
