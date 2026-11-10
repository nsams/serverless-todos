import { createSerializationAdapter, notFound } from "@tanstack/react-router";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

import { NotFoundError, ValidationError } from "./errors";
import type { RequestContext } from "./server";

const csrfMiddleware = createCsrfMiddleware({
    filter: (ctx) => ctx.handlerType === "serverFn",
});

// Every request is authenticated before it reaches the app (src/server.ts), which passes the user as request context. Passed on by a
// middleware, so the server functions' context is typed: Start types the request context (Register.server.requestContext) as {}
// wherever the start instance's own middlewares are typed (a circular reference through Register.config).
const userMiddleware = createMiddleware().server(({ context, next }) => {
    const { user } = context as unknown as RequestContext;
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
    requestMiddleware: [csrfMiddleware, userMiddleware],
    functionMiddleware: [operationErrorMiddleware],
    serializationAdapters: [validationErrorAdapter],
}));
