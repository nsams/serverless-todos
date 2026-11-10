import handler from "@tanstack/react-start/server-entry";
import { getAgentByName } from "agents";

import { getUser, type User } from "./auth.server";
import { chatAgentPath } from "./chat/chat";
import { handleMcpRequest, mcpPath } from "./mcp/mcp.server";

export { ChatAgent } from "./chat/agent.server";

// Custom worker entry:
// - authenticates every request (Cloudflare Access, src/auth.server.ts) in one place, before it is routed: the app (pages and server
//   functions get the user as request context), the chat and the MCP server, and any endpoint added later
// - routes the chat (WebSocket and HTTP requests from useAgentChat) to the user's chat agent
// - serves the MCP server for external AI clients (src/mcp/mcp.server.ts)
export default {
    async fetch(request, env, ctx) {
        // `ctx.access`: set by the runtime on requests that matched an Access application
        const user = await getUser(request, ctx.access);
        if (!user) {
            return new Response("Forbidden", { status: 403 });
        }
        const { pathname } = new URL(request.url);
        if (pathname === `/${chatAgentPath}` || pathname.startsWith(`/${chatAgentPath}/`)) {
            // WebSockets aren't protected by CORS
            if (isForeignOrigin(request)) {
                return new Response("Forbidden", { status: 403 });
            }
            // one agent per user: the instance is chosen by the authenticated user, never by the client
            const agent = await getAgentByName(env.ChatAgent, user.id);
            return agent.fetch(request);
        }
        if (pathname === mcpPath) {
            // MCP clients authenticate with an OAuth token issued by Cloudflare Access (managed OAuth), Access verifies it and forwards
            // the request with the Access JWT like for a browser session. Browser-based clients of other sites are rejected.
            if (isForeignOrigin(request)) {
                return new Response("Forbidden", { status: 403 });
            }
            return handleMcpRequest(request, user.id);
        }
        return handler.fetch(request, { context: { user } });
    },
} satisfies ExportedHandler<Env>;

// Requests from browsers of other sites carry the user's Access cookie: reject them (CSRF, cross-site WebSocket hijacking).
// The server functions are checked by Start's CSRF middleware (src/start.ts).
function isForeignOrigin(request: Request) {
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== new URL(request.url).origin) {
        console.warn(`Request denied: foreign origin ${origin}`);
        return true;
    }
    return false;
}

// The context of every request of the app: the authenticated user (context.user in server functions and middleware)
export type RequestContext = { user: User };

declare module "@tanstack/react-router" {
    interface Register {
        server: { requestContext: RequestContext };
    }
}
