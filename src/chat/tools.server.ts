import { tool, type ToolSet } from "ai";

import { createTools } from "~/modules/registry.server";

// The tools of the modules (AppTool, src/modules/types.ts) as AI SDK tools for the chat assistant. Deleting needs the user's confirmation in the chat.
export function createChatTools(userId: string): ToolSet {
    return Object.fromEntries(
        Object.entries(createTools(userId)).map(([name, { description, inputSchema, effect, execute }]) => [
            name,
            tool({ description, inputSchema, needsApproval: effect === "delete", execute: (input) => execute(input) }),
        ]),
    );
}
