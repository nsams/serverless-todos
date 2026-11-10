import { tool, type ToolSet } from "ai";

import { createTools } from "~/modules/registry.server";

// The tools of the modules (AppTool, src/modules/types.ts) as AI SDK tools for the chat assistant. Deleting needs the user's confirmation in the chat.
// onChange: called with the module's id after a tool changed data (effect write or delete), so the client can reload that module's data.
export function createChatTools(userId: string, onChange: (module: string) => void): ToolSet {
    return Object.fromEntries(
        Object.entries(createTools(userId)).map(([name, { module, description, inputSchema, effect, execute }]) => [
            name,
            tool({
                description,
                inputSchema,
                needsApproval: effect === "delete",
                execute: async (input) => {
                    const result = await execute(input);
                    if (effect !== "read") {
                        onChange(module);
                    }
                    return result;
                },
            }),
        ]),
    );
}
