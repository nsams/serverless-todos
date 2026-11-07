import { createFileRoute } from "@tanstack/react-router";

import { handleMcpRequest } from "~/mcp.server";

// MCP endpoint (Streamable HTTP). Authenticated like every other request by the global request middleware (src/start.ts),
// MCP clients sign in via Cloudflare Access managed OAuth (see README).
export const Route = createFileRoute("/mcp")({
    server: {
        handlers: {
            ANY: ({ request, context: { user } }) => handleMcpRequest(request, user),
        },
    },
});
