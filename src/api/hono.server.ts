import { Hono } from "hono";
import type { BlankInput, Handler, ParamKeys, TypedResponse } from "hono/types";
import type { JSONParsed } from "hono/utils/types";

import type { User } from "~/auth.server";
import { NotFoundError, ValidationError } from "~/errors";
import { type Operation, type OperationInput, type OperationOutput, runOperation } from "~/operations";
import { parseSearch } from "~/searchParams";

// The context of the API's handlers: the authenticated user (set by the middleware in src/server.ts)
export type ApiEnv = { Bindings: Env; Variables: { user: User } };

// A part of the API, e.g. the routes of a module (mounted by src/api/api.server.ts)
export function createApi() {
    return new Hono<ApiEnv>();
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// The input the client sends to an operation's route besides the path params: the query (GET) or the JSON body; none if the path params
// are the whole input
type RouteInput<M extends Method, Path extends string, Op extends Operation> =
    Omit<OperationInput<Op>, ParamKeys<Path>> extends infer Rest
        ? [keyof Rest] extends [never]
            ? BlankInput
            : string extends keyof Rest
              ? // an empty object schema (z.object({}))
                BlankInput
              : { in: { [Target in M extends "GET" ? "query" : "json"]: Rest } }
        : never;

type RouteResponse<Op extends Operation> = Promise<TypedResponse<JSONParsed<OperationOutput<Op>>, 200, "json">>;

// A route that runs an operation (src/operations.ts) for the authenticated user. Its input is the path params plus the query (GET) or
// the JSON body, validated by the operation's schema; the response is the operation's result as JSON. The operation's errors are mapped
// to status codes once (errorResponse). Returns the arguments of Hono's `on`, so the route is typed by the path's params and the
// operation, for the typed client:
//
//     createApi().on(...operationRoute("PATCH", "/lists/:listId", todoOperations.renameList))
export function operationRoute<const M extends Method, const Path extends string, Op extends Operation>(
    method: M,
    path: Path,
    operation: Op,
): [M, Path, Handler<ApiEnv, Path, RouteInput<M, Path, Op>, RouteResponse<Op>>] {
    return [
        method,
        path,
        async (c) => {
            const input = method === "GET" ? parseSearch(new URL(c.req.url).search) : await readJson(c.req.raw);
            const result = await runOperation(operation, { userId: c.var.user.id, source: "app" }, { ...input, ...c.req.param() });
            // c.json's type doesn't know the operation's output type (a type parameter)
            return c.json(result) as unknown as Awaited<RouteResponse<Op>>;
        },
    ];
}

// The JSON body of a request; no body is no input (e.g. DELETE)
async function readJson(request: Request): Promise<object> {
    const text = await request.text();
    if (!text) {
        return {};
    }
    try {
        return JSON.parse(text) as object;
    } catch {
        throw new ValidationError("Invalid JSON");
    }
}

// The operations' errors as responses (the API's onError): not found (or belonging to another user): 404; invalid input: 422 with the
// message for the form (e.g. "Name is required"); anything else: 500, logged, without details for the client
export function errorResponse(error: Error) {
    if (error instanceof NotFoundError) {
        return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
        return Response.json({ error: error.message }, { status: 422 });
    }
    console.error(error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
}
