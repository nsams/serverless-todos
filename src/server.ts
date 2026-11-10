import handler from "@tanstack/react-start/server-entry";

import { chatPath } from "./chat/chat";
import { handleChatRequest } from "./chat/chat.server";
import { mcpPath } from "./mcp/mcp";
import { handleMcpRequest } from "./mcp/mcp.server";
import type { User } from "./user";

// The requests of an authenticated user, the same on both platforms. The server entry of the platform (src/server.cloudflare.ts,
// src/server.node.ts) authenticates every request in one place before it calls this, so an endpoint added later is authenticated too:
// - the chat assistant (src/chat/chat.server.ts)
// - the MCP server for external AI clients (src/mcp/mcp.server.ts)
// - the app: pages and server functions get the user as request context
export async function handleRequest(request: Request, user: User): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === chatPath) {
        if (isForeignOrigin(request)) {
            return new Response("Forbidden", { status: 403 });
        }
        return handleChatRequest(request, user.id);
    }
    if (pathname === mcpPath) {
        // MCP clients aren't browsers: browser-based clients of other sites are rejected
        if (isForeignOrigin(request)) {
            return new Response("Forbidden", { status: 403 });
        }
        return handleMcpRequest(request, user.id);
    }
    return handler.fetch(request, { context: { user } });
}

// Requests from browsers of other sites carry the user's login cookie: reject them (CSRF).
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
