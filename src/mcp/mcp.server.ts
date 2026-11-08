import { McpServer, type ToolAnnotations } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";

import { createTodoTools, type TodoTool, todoToolsInstructions } from "~/todoTools.server";

// MCP server for external AI clients (e.g. Claude Desktop, claude.ai, Claude Code): the same tools as the chat assistant (src/todoTools.server.ts).
// Stateless Streamable HTTP endpoint at /mcp (no Durable Object, no MCP session). Authentication is done by Cloudflare Access like for every other
// request; MCP clients sign in through Access's managed OAuth (see README). src/server.ts authenticates the request and passes the user.

export const mcpPath = "/mcp";

const annotations: Record<TodoTool["effect"], ToolAnnotations> = {
    read: { readOnlyHint: true, openWorldHint: false },
    write: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    // MCP clients ask the user before calling it (depending on the user's settings)
    delete: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
};

function createTodoMcpServer(userId: string) {
    const server = new McpServer(
        { name: "serverless-todos", title: "Todos", version: "1.0.0" },
        { instructions: ["Manages the user's todo lists and todos.", ...todoToolsInstructions].join("\n") },
    );
    const todoTools: Record<string, TodoTool> = createTodoTools(userId);
    for (const [name, { title, description, inputSchema, effect, execute }] of Object.entries(todoTools)) {
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

// Handles a request to /mcp of an authenticated user
export function handleMcpRequest(request: Request, userId: string) {
    const handler = createMcpHandler(() => createTodoMcpServer(userId), {
        route: mcpPath,
        // MCP clients aren't browsers: no CORS; foreign Origins are rejected by src/server.ts
        corsOptions: false,
        allowedOriginHostnames: "*",
        onerror: (error) => console.error("MCP error", error),
    });
    return handler.fetch(request);
}
