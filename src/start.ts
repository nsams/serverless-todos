import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

import { getUser } from "./auth.server";
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

export const startInstance = createStart(() => ({
    requestMiddleware: [csrfMiddleware, authMiddleware],
}));
