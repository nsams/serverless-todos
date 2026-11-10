import { createApi } from "./hono.server";

// The core's routes of the REST API (src/api/api.server.ts)
export const userApi = createApi()
    // The authenticated user
    .get("/user", (c) => c.json(c.var.user));
