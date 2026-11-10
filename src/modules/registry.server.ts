import type { ChatPage } from "~/chat/chat";
import { toolsFromOperations } from "~/operations";

import { notesServerModule } from "./notes/module.server";
import { todosServerModule } from "./todos/module.server";
import type { AppTool, ServerModule } from "./types";

// The modules of the app (server part). App shell part: registry.ts.
const serverModules: ServerModule[] = [todosServerModule, notesServerModule];

// The tools of all modules for the AI assistants (the operations with AI metadata), scoped to the user
export function createTools(userId: string): Record<string, AppTool> {
    const tools: Record<string, AppTool> = {};
    for (const module of serverModules) {
        for (const [name, tool] of Object.entries(toolsFromOperations(module.id, module.operations, { userId }))) {
            if (Object.hasOwn(tools, name)) {
                throw new Error(`Tool ${name} is defined by more than one module`);
            }
            tools[name] = tool;
        }
    }
    return tools;
}

export const toolsInstructions = serverModules.flatMap((module) => module.instructions);

// What the user is looking at in the app, for the chat assistant
export async function getChatContext(userId: string, page: ChatPage | undefined) {
    const contexts = await Promise.all(serverModules.map((module) => module.chatContext?.(userId, page) ?? []));
    return contexts.flat();
}
