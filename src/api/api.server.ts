import { HTTPException } from "hono/http-exception";

import { serverModules } from "~/modules/registry.server";

import { createApi, errorResponse } from "./hono.server";
import { userApi } from "./user.server";

// The REST API of the app, mounted at /api by the worker (src/server.ts), which authenticates every request: the core's routes and
// each module's REST API at /api/<module id>. The app calls them with typed clients (src/api/client.ts): the type of a module's routes
// is its API's contract.
//
// Conventions: JSON in and out; a route runs an operation of its module (operationRoute, src/api/hono.server.ts); invalid input
// (e.g. an empty name): 422 with { error }, shown in the form; not found (or belonging to another user): 404.
export const api = createApi()
    .onError((error) => (error instanceof HTTPException ? error.getResponse() : errorResponse(error)))
    .route("/", userApi);

// Not chained: the app uses a typed client per module (e.g. src/modules/todos/api.ts), so the type of this API doesn't matter
for (const module of serverModules) {
    if (module.api) {
        api.route(`/${module.id}`, module.api);
    }
}
