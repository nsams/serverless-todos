import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { User } from "./auth.server";
import { dateStringSchema } from "./dates";
import { getListRepository } from "./db/lists.server";
import { getTodoRepository } from "./db/todos.server";
import { maxTodoDescriptionLength, maxTodoTitleLength } from "./limits";

// MCP server (Streamable HTTP, stateless) at /mcp, see src/routes/mcp.ts. Lets MCP clients (Claude, ...) create todos for the authenticated user.

function createMcpServer(user: User) {
    const server = new McpServer({ name: "serverless-todos", version: "1.0.0" });

    server.registerTool(
        "list_lists",
        {
            title: "List todo lists",
            description: "Lists the user's todo lists (id, name, number of open todos). Use the id as listId for create_todo.",
            inputSchema: z.object({}),
            outputSchema: z.object({ lists: z.array(z.object({ id: z.string(), name: z.string(), openCount: z.number() })) }),
            annotations: { readOnlyHint: true },
        },
        async () => {
            const lists = await getListRepository().list(user.id);
            const output = { lists: lists.map(({ id, name, openCount }) => ({ id, name, openCount })) };
            return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
        },
    );

    server.registerTool(
        "create_todo",
        {
            title: "Create todo",
            description: "Creates a todo. Without listId it is added to the user's first list (created if the user has no list yet).",
            inputSchema: z.object({
                title: z.string().trim().min(1).max(maxTodoTitleLength).describe("Title of the todo"),
                description: z.string().trim().max(maxTodoDescriptionLength).optional().describe("Optional longer description (plain text)"),
                dueDate: dateStringSchema.optional().describe("Optional due date as calendar date YYYY-MM-DD"),
                listId: z.string().optional().describe("Id of the list (see list_lists); defaults to the user's first list"),
            }),
            outputSchema: z.object({
                id: z.string(),
                listId: z.string(),
                title: z.string(),
                description: z.string(),
                dueDate: z.string().nullable(),
            }),
        },
        async ({ title, description = "", dueDate = null, listId }) => {
            const targetListId = listId ?? (await getListRepository().getOrCreateDefault(user.id)).id;
            const todo = await getTodoRepository().create(user.id, targetListId, { title, description, dueDate });
            if (!todo) {
                return { content: [{ type: "text", text: `List ${targetListId} not found` }], isError: true };
            }
            const output = { id: todo.id, listId: todo.listId, title: todo.title, description: todo.description, dueDate: todo.dueDate };
            return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
        },
    );

    return server;
}

export function handleMcpRequest(request: Request, user: User) {
    // MCP clients don't send an Origin header; a browser does (cross-site requests from other origins are rejected, as recommended by the MCP spec)
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== new URL(request.url).origin) {
        return new Response("Forbidden", { status: 403 });
    }
    // a fresh (stateless) server per request, bound to the authenticated user
    return createMcpHandler(() => createMcpServer(user), { onerror: (error) => console.error("MCP error", error) }).fetch(request);
}
