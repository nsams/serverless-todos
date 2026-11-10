import { createSerializationAdapter, notFound } from "@tanstack/react-router";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

import { getUser } from "./auth.server";
import { NotFoundError, ValidationError } from "./errors";
import type { RequestContext } from "./server";

const csrfMiddleware = createCsrfMiddleware({
    filter: (ctx) => ctx.handlerType === "serverFn",
});

// Every request (pages and server functions) must have been authenticated by Cloudflare Access; the user is passed on as context
const authMiddleware = createMiddleware().server(async ({ request, context, next }) => {
    // the request context passed in src/server.ts; not reflected in the request middleware's context type
    const { access } = context as unknown as RequestContext;
    const user = await getUser(request, access);
    if (!user) {
        return new Response("Forbidden", { status: 403 });
    }
    return next({ context: { user } });
});

// The errors of the operations (src/errors.ts) in the server functions, mapped once for all of them: NotFoundError is the router's
// not found (the route's notFoundComponent), a ValidationError reaches the client as ValidationError (validationErrorAdapter), whose
// message the form shows
const operationErrorMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
    try {
        return await next();
    } catch (error) {
        if (error instanceof NotFoundError) {
            throw notFound();
        }
        throw error;
    }
});

// Errors are serialized as plain Errors with their message; a ValidationError keeps its class
const validationErrorAdapter = createSerializationAdapter({
    key: "ValidationError",
    test: (value): value is ValidationError => value instanceof ValidationError,
    toSerializable: (error) => error.message,
    fromSerializable: (message) => new ValidationError(message),
});

export const startInstance = createStart(() => ({
    requestMiddleware: [csrfMiddleware, authMiddleware],
    functionMiddleware: [operationErrorMiddleware],
    serializationAdapters: [validationErrorAdapter],
}));
