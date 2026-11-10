import { createMcpHandler, McpServer, type ToolAnnotations } from "@modelcontextprotocol/server";

import { appName } from "~/app";
import { createTools, toolsInstructions } from "~/modules/registry.server";
import type { AppTool } from "~/modules/types";

// MCP server for external AI clients (e.g. Claude Desktop, claude.ai, Claude Code): the same tools of the modules as the chat assistant.
// Stateless Streamable HTTP endpoint at /mcp (src/mcp/mcp.ts; no MCP session). The server entry authenticates the request like every other and
// src/server.ts passes the user: on Cloudflare MCP clients sign in through Access's managed OAuth, on Node with an OAuth token of the
// identity provider (src/platform/oidc.server.ts), see README.

const annotations: Record<AppTool["effect"], ToolAnnotations> = {
    read: { readOnlyHint: true, openWorldHint: false },
    write: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    // MCP clients ask the user before calling it (depending on the user's settings)
    delete: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
};

function createMcpServer(userId: string) {
    const server = new McpServer({ name: "serverless-todos", title: appName, version: "1.0.0" }, { instructions: toolsInstructions.join("\n") });
    for (const [name, { title, description, inputSchema, effect, execute }] of Object.entries(createTools(userId))) {
        server.registerTool(name, { title, description, inputSchema, annotations: { title, ...annotations[effect] } }, async (input: unknown) => {
            try {
                const result = await execute(input);
                return { content: [{ type: "text", text: JSON.stringify(result) }] };
            } catch (error) {
                // reported to the model, like in the chat assistant
                return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
            }
        });
    }
    return server;
}

// Handles a request to /mcp of an authenticated user (current and 2025 protocol versions). MCP clients aren't browsers: no CORS;
// foreign Origins are rejected by src/server.ts
export function handleMcpRequest(request: Request, userId: string) {
    const handler = createMcpHandler(() => createMcpServer(userId), {
        onerror: (error) => console.error("MCP error", error),
    });
    return handler.fetch(request);
}
