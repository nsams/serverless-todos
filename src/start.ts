import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

import { getUserFromAccessJwt } from "./auth.server";

const csrfMiddleware = createCsrfMiddleware({
    filter: (ctx) => ctx.handlerType === "serverFn",
});

// Every request (pages and server functions) must carry a valid Cloudflare Access JWT; the user is passed on as context
const authMiddleware = createMiddleware().server(async ({ request, next }) => {
    const user = await getUserFromAccessJwt(request);
    if (!user) {
        return new Response("Forbidden", { status: 403 });
    }
    return next({ context: { user } });
});

export const startInstance = createStart(() => ({
    requestMiddleware: [csrfMiddleware, authMiddleware],
}));
