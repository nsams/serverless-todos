import { notFound } from "@tanstack/react-router";
import { type ClientResponse, DetailedError, hc, parseResponse } from "hono/client";

import type { Api } from "./api.server";

// The typed client of the REST API (src/api/api.server.ts, type-only import): paths, params, query, JSON bodies and responses
// are checked against the API's routes. parseResponse (hono/client) returns the body of a successful response and throws
// a DetailedError (with statusCode) for error responses.
export const api = hc<Api>("/api");

// For the data of a route's loader: the body of a successful response; a 404 is shown as "not found" by the route
// (its notFoundComponent, see src/client/errors.tsx)
export async function loadResponse<Response extends ClientResponse<unknown>>(request: Promise<Response>): ReturnType<typeof parseResponse<Response>> {
    try {
        return await parseResponse(request);
    } catch (error) {
        if (error instanceof DetailedError && error.statusCode === 404) {
            throw notFound();
        }
        throw error;
    }
}
