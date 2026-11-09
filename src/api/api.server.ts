import { modulesApi } from "~/modules/registry.server";

import { createApi } from "./hono.server";

// The REST API of the app, mounted at /api by the worker (src/server.ts), which authenticates every request.
// The app calls it with the typed client (src/api/client.ts): the type of the routes below is the API's contract.
//
// Conventions: JSON in and out; input validated with zod (invalid input: 400); user errors that a form shows at its field
// (e.g. an empty name): 422 with { error }; not found (or belonging to another user): 404; changes without a result: 204.
export const api = createApi()
    // The authenticated user
    .get("/user", (c) => c.json(c.var.user))
    .route("/", modulesApi);

export type Api = typeof api;
