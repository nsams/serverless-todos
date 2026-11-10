import { getAgentByName } from "agents";

import { apiPath } from "./api/api";
import { handleApiRequest } from "./api/router.server";
import { getUser } from "./auth.server";
import { chatAgentPath } from "./chat/chat";
import { handleMcpRequest, mcpPath } from "./mcp/mcp.server";

export { ChatAgent } from "./chat/agent.server";

// Worker entry. The app itself (index.html, JS, CSS) is a single-page app served as static assets (wrangler.jsonc: `assets`); the worker
// only gets the requests to its endpoints (`assets.run_worker_first`), each authenticated with Cloudflare Access once here (`ctx.access`,
// set by the runtime on requests that matched an Access application, or the Access JWT, see src/auth.server.ts), before it is routed:
// - the app's API (tRPC, src/api/router.server.ts)
// - the chat (WebSocket and HTTP requests from useAgentChat), routed to the user's chat agent
// - the MCP server for external AI clients (src/mcp/mcp.server.ts)
export default {
    async fetch(request, env, ctx) {
        // Requests from browsers of other sites carry the user's Access cookie: reject them (CSRF, cross-site WebSocket hijacking;
        // WebSockets aren't protected by CORS). MCP clients aren't browsers of other sites either.
        if (isForeignOrigin(request)) {
            return new Response("Forbidden", { status: 403 });
        }
        const user = await getUser(request, ctx.access);
        if (!user) {
            return new Response("Forbidden", { status: 403 });
        }
        const { pathname } = new URL(request.url);
        if (pathname === apiPath || pathname.startsWith(`${apiPath}/`)) {
            return handleApiRequest(request, user);
        }
        if (pathname === `/${chatAgentPath}` || pathname.startsWith(`/${chatAgentPath}/`)) {
            // one agent per user: the instance is chosen by the authenticated user, never by the client
            const agent = await getAgentByName(env.ChatAgent, user.id);
            return agent.fetch(request);
        }
        if (pathname === mcpPath) {
            // MCP clients authenticate with an OAuth token issued by Cloudflare Access (managed OAuth), Access verifies it and forwards the
            // request with the Access JWT like for a browser session
            return handleMcpRequest(request, user.id);
        }
        return new Response("Not found", { status: 404 });
    },
} satisfies ExportedHandler<Env>;

function isForeignOrigin(request: Request) {
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== new URL(request.url).origin) {
        console.warn(`Request denied: foreign origin ${origin}`);
        return true;
    }
    return false;
}
