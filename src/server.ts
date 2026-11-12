import { getAgentByName } from "agents";
import { Hono } from "hono";

import { api } from "./api/api.server";
import { getUser, type User } from "./auth.server";
import { chatAgentPath } from "./chat/chat";
import { handleMcpRequest, mcpPath } from "./mcp/mcp.server";

export { ChatAgent } from "./chat/agent.server";
export { TodoDraft } from "./modules/todos/draft/draftAgent.server";

// Worker entry (Hono). The app itself (index.html, JS, CSS) is served as static assets without the worker (single-page application,
// see wrangler.jsonc); the worker handles:
// - the REST API of the app at /api (src/api/api.server.ts), used by the app with the typed client (src/api/client.ts)
// - the chat (WebSocket and HTTP requests from useAgentChat), routed to the user's chat agent
// - the MCP server for external AI clients (src/mcp/mcp.server.ts)
const app = new Hono<{ Bindings: Env; Variables: { user: User } }>();

// Every request must have been authenticated by Cloudflare Access; the user is passed on as context variable
app.use(async (c, next) => {
    // Requests from browsers of other sites carry the user's Access cookie: reject them (CSRF, cross-site WebSocket hijacking:
    // WebSockets aren't protected by CORS)
    if (isForeignOrigin(c.req.raw)) {
        return c.text("Forbidden", 403);
    }
    // `ctx.access` is set by the runtime on requests that matched an Access application (not part of Hono's ExecutionContext type)
    const { access } = c.executionCtx as ExecutionContext;
    const user = await getUser(c.req.raw, access);
    if (!user) {
        return c.text("Forbidden", 403);
    }
    c.set("user", user);
    await next();
});

app.route("/api", api);

// MCP clients authenticate with an OAuth token issued by Cloudflare Access (managed OAuth), Access verifies it and forwards the request
// with the Access JWT like for a browser session
app.all(mcpPath, (c) => handleMcpRequest(c.req.raw, c.var.user.id));

// one agent per user: the instance is chosen by the authenticated user, never by the client
const handleChatRequest = async (request: Request, env: Env, user: User) => (await getAgentByName(env.ChatAgent, user.id)).fetch(request);
app.all(`/${chatAgentPath}`, (c) => handleChatRequest(c.req.raw, c.env, c.var.user));
app.all(`/${chatAgentPath}/*`, (c) => handleChatRequest(c.req.raw, c.env, c.var.user));

export default app;

function isForeignOrigin(request: Request) {
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== new URL(request.url).origin) {
        console.warn(`Request denied: foreign origin ${origin}`);
        return true;
    }
    return false;
}
