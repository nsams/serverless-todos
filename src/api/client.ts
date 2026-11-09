import { DetailedError, hc } from "hono/client";

import type { Api } from "./api.server";

// The typed client of the REST API (src/api/api.server.ts, type-only import): paths, params, query, JSON bodies and responses
// are checked against the API's routes. parseResponse (hono/client) returns the body of a successful response and throws
// a DetailedError (with statusCode) for error responses; the pages' queries (TanStack Query) use it as their queryFn.
export const api = hc<Api>("/api");

// An error response of the API (thrown by parseResponse), e.g. a 404; not a network error
export function isHttpError(error: unknown): error is DetailedError & { statusCode: number } {
    return error instanceof DetailedError && error.statusCode !== undefined;
}

// The API's 404 (not found, or belonging to another user): shown as "not found" by the page (see src/client/errors.tsx)
export function isNotFound(error: unknown) {
    return isHttpError(error) && error.statusCode === 404;
}
