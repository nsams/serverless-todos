import { getAgentByName } from "agents";
import { createRequestHandler, RouterContextProvider } from "react-router";

import { getUser } from "./auth.server";
import { chatAgentPath } from "./chat/chat";
import { accessContext } from "./context";
import { handleMcpRequest, mcpPath } from "./mcp/mcp.server";

export { ChatAgent } from "./chat/agent.server";

// The React Router app (src/routes.ts)
const handleAppRequest = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

// Custom worker entry:
// - passes Cloudflare Access (`ctx.access`, set by the runtime on requests that matched an Access application) to the app
// - routes the chat (WebSocket and HTTP requests from useAgentChat) to the user's chat agent
// - serves the MCP server for external AI clients (src/mcp/mcp.server.ts)
export default {
    async fetch(request, env, ctx) {
        const { pathname } = new URL(request.url);
        if (pathname === `/${chatAgentPath}` || pathname.startsWith(`/${chatAgentPath}/`)) {
            return handleChatRequest(request, env, ctx.access);
        }
        if (pathname === mcpPath) {
            return handleMcp(request, ctx.access);
        }
        const context = new RouterContextProvider();
        context.set(accessContext, ctx.access);
        return handleAppRequest(request, context);
    },
} satisfies ExportedHandler<Env>;

// Requests from browsers of other sites carry the user's Access cookie: reject them (CSRF, cross-site WebSocket hijacking)
function isForeignOrigin(request: Request) {
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== new URL(request.url).origin) {
        console.warn(`Request denied: foreign origin ${origin}`);
        return true;
    }
    return false;
}

// Chat requests bypass the app's middleware (src/root.tsx), so they are authenticated here
async function handleChatRequest(request: Request, env: Env, access: CloudflareAccessContext | undefined) {
    // WebSockets aren't protected by CORS
    if (isForeignOrigin(request)) {
        return new Response("Forbidden", { status: 403 });
    }
    const user = await getUser(request, access);
    if (!user) {
        return new Response("Forbidden", { status: 403 });
    }
    // one agent per user: the instance is chosen by the authenticated user, never by the client
    const agent = await getAgentByName(env.ChatAgent, user.id);
    return agent.fetch(request);
}

// MCP requests bypass the app's request middleware too. MCP clients authenticate with an OAuth token issued by Cloudflare Access (managed OAuth),
// Access verifies it and forwards the request with the Access JWT like for a browser session.
async function handleMcp(request: Request, access: CloudflareAccessContext | undefined) {
    if (isForeignOrigin(request)) {
        return new Response("Forbidden", { status: 403 });
    }
    const user = await getUser(request, access);
    if (!user) {
        return new Response("Forbidden", { status: 403 });
    }
    return handleMcpRequest(request, user.id);
}
