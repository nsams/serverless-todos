import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { z } from "zod";

import type { User } from "~/auth.server";
import { NotFoundError, ValidationError } from "~/errors";
import { inputValidationError, type Operation } from "~/operations";

// The API of the app (tRPC): every module's router (e.g. src/modules/todos/api.server.ts) mounted under the module's id, see
// src/api/router.server.ts. Every request has been authenticated (src/server.ts): the context has the user, every procedure is scoped to that user.
export type ApiContext = { user: User };

const t = initTRPC.context<ApiContext>().create({
    // keeps Dates (e.g. createdAt) as Dates on the client
    transformer: superjson,
    isDev: import.meta.env.DEV,
    errorFormatter: ({ shape, error }) => {
        // invalid input (the operation's schema, validated by tRPC): the schema's messages (e.g. "Name is required"), like the operations'
        // ValidationErrors, instead of the issues as JSON
        if (error.code === "BAD_REQUEST" && error.cause && "issues" in error.cause && Array.isArray(error.cause.issues)) {
            return { ...shape, message: inputValidationError(error.cause.issues as { message: string }[]).message };
        }
        // details of unexpected errors (e.g. database errors) only in development
        return error.code === "INTERNAL_SERVER_ERROR" && !import.meta.env.DEV ? { ...shape, message: "Internal server error" } : shape;
    },
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;

// The operations' errors (src/errors.ts) as tRPC errors; the client turns them back into NotFoundError and ValidationError (src/api/client.ts)
export const procedure = t.procedure.use(async ({ next }) => {
    const result = await next();
    if (!result.ok) {
        const { cause } = result.error;
        if (cause instanceof NotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: cause.message, cause });
        }
        if (cause instanceof ValidationError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: cause.message, cause });
        }
    }
    return result;
});

// A procedure that runs an operation (src/operations.ts) for the authenticated user: validated with the operation's schema, typed by it
// (input) and by its handler (output). Reads are queries (batched as GET), changes are mutations.
export function query<Input extends z.ZodType, Output>(operation: Operation<Input, Output>) {
    return procedure.input(operation.input).query(({ ctx, input }) => runHandler(operation, ctx, input));
}

export function mutation<Input extends z.ZodType, Output>(operation: Operation<Input, Output>) {
    return procedure.input(operation.input).mutation(({ ctx, input }) => runHandler(operation, ctx, input));
}

// input: parsed by tRPC with the operation's schema (TypeScript can't follow tRPC's parser inference for a generic schema)
function runHandler<Input extends z.ZodType, Output>(operation: Operation<Input, Output>, ctx: ApiContext, input: unknown) {
    return operation.handler({ userId: ctx.user.id }, input as z.output<Input>);
}
