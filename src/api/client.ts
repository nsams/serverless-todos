import type { Hono } from "hono";
import { hc } from "hono/client";

import { NotFoundError, ValidationError } from "~/errors";

import type { userApi } from "./user.server";

// Typed clients of the REST API (src/api/api.server.ts): paths, params, query, JSON bodies and responses are checked against the
// routes (type-only imports). parseResponse (hono/client) returns the body of a response, e.g.
// `await parseResponse(todosClient.lists.$post({ json: { name } }))`.

// The client of a module's REST API (mounted at /api/<module id>), e.g. createClient<typeof todosApi>(todosModuleId)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any API (its env and routes)
export function createClient<App extends Hono<any, any, any>>(moduleId: string): ReturnType<typeof hc<App>> {
    return hc<App>(`/api/${moduleId}`, { fetch: fetchApi });
}

// The core's routes, e.g. the authenticated user
export const userClient = hc<typeof userApi>("/api", { fetch: fetchApi });

// Error responses throw the operations' errors (src/errors.ts), so the forms show a ValidationError's message and a page shows
// a NotFoundError as "not found" (src/client/errors.tsx)
async function fetchApi(input: RequestInfo | URL, init?: RequestInit) {
    const response = await fetch(input, init);
    if (response.ok) {
        return response;
    }
    const message = await response.json<{ error?: string }>().then(
        (body) => body.error,
        () => undefined,
    );
    if (response.status === 404) {
        throw new NotFoundError(message ?? "Not found");
    }
    if (response.status === 422) {
        throw new ValidationError(message ?? "Invalid input");
    }
    throw new Error(`${init?.method ?? "GET"} ${String(input)} failed: ${response.status} ${message ?? response.statusText}`);
}
