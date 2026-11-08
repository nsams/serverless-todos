import { tool, type ToolSet } from "ai";

import { createTodoTools, type TodoTool } from "~/todoTools.server";

// The todo tools (src/todoTools.server.ts) as AI SDK tools for the chat assistant. Deleting needs the user's confirmation in the chat.
export function createChatTools(userId: string): ToolSet {
    const todoTools: Record<string, TodoTool> = createTodoTools(userId);
    return Object.fromEntries(
        Object.entries(todoTools).map(([name, { description, inputSchema, effect, execute }]) => [
            name,
            tool({ description, inputSchema, needsApproval: effect === "delete", execute: (input) => execute(input) }),
        ]),
    );
}
