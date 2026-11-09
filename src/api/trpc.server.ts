import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import type { User } from "~/auth.server";

// The API of the app (tRPC): the procedures of the modules (e.g. src/modules/todos/lists.api.server.ts), composed in src/api/router.server.ts.
// Every request has been authenticated (src/server.ts): the context has the user, every procedure is scoped to that user.
export type ApiContext = { user: User };

const t = initTRPC.context<ApiContext>().create({
    // keeps Dates (e.g. createdAt) as Dates on the client
    transformer: superjson,
    isDev: import.meta.env.DEV,
    errorFormatter: ({ shape, error }) =>
        // details of unexpected errors (e.g. database errors) only in development
        error.code === "INTERNAL_SERVER_ERROR" && !import.meta.env.DEV ? { ...shape, message: "Internal server error" } : shape,
});

export const router = t.router;
export const procedure = t.procedure;

// e.g. a list that doesn't exist or belongs to another user; the client's loaders turn it into a 404 page (src/routing.ts)
export function notFound() {
    return new TRPCError({ code: "NOT_FOUND" });
}
