import { type ClientResponse, DetailedError, hc, parseResponse } from "hono/client";
import { data } from "react-router";

import type { Api } from "./api.server";

// The typed client of the REST API (src/api/api.server.ts, type-only import): paths, params, query, JSON bodies and responses
// are checked against the API's routes. parseResponse (hono/client) returns the body of a successful response and throws
// a DetailedError (with statusCode) for error responses.
export const api = hc<Api>("/api");

// For a route's loader: the body of a successful response; a 404 is shown as "not found" by the route's error boundary
export async function loadResponse<Response extends ClientResponse<unknown>>(request: Promise<Response>): ReturnType<typeof parseResponse<Response>> {
    try {
        return await parseResponse(request);
    } catch (error) {
        if (error instanceof DetailedError && error.statusCode === 404) {
            throw data("Not found", { status: 404 });
        }
        throw error;
    }
}
