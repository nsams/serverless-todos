import handler from "@tanstack/react-start/server-entry";
import { getAgentByName } from "agents";

import { getUser } from "./auth.server";
import { chatAgentPath } from "./chat/chat";

export { TodoChatAgent } from "./chat/agent.server";

// Custom worker entry:
// - passes Cloudflare Access (`ctx.access`, set by the runtime on requests that matched an Access application) to the app
// - routes the chat (WebSocket and HTTP requests from useAgentChat) to the user's chat agent
export default {
    async fetch(request, env, ctx) {
        const { pathname } = new URL(request.url);
        if (pathname === `/${chatAgentPath}` || pathname.startsWith(`/${chatAgentPath}/`)) {
            return handleChatRequest(request, env, ctx.access);
        }
        return handler.fetch(request, { context: { access: ctx.access } });
    },
} satisfies ExportedHandler<Env>;

// Chat requests bypass the app's request middleware (src/start.ts), so they are authenticated here
async function handleChatRequest(request: Request, env: Env, access: CloudflareAccessContext | undefined) {
    // WebSockets aren't protected by CORS: reject connections opened by other sites (cross-site WebSocket hijacking)
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== new URL(request.url).origin) {
        console.warn(`Chat request denied: foreign origin ${origin}`);
        return new Response("Forbidden", { status: 403 });
    }
    const user = await getUser(request, access);
    if (!user) {
        return new Response("Forbidden", { status: 403 });
    }
    // one agent per user: the instance is chosen by the authenticated user, never by the client
    const agent = await getAgentByName(env.TodoChatAgent, user.id);
    return agent.fetch(request);
}

export type RequestContext = { access: CloudflareAccessContext | undefined };

declare module "@tanstack/react-router" {
    interface Register {
        server: { requestContext: RequestContext };
    }
}
