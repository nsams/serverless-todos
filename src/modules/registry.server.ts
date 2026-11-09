import type { ChatPage } from "~/chat/chat";

import { notesServerModule } from "./notes/module.server";
import { notesModuleId } from "./notes/navigation";
import { todosServerModule } from "./todos/module.server";
import { todosModuleId } from "./todos/navigation";
import type { AppTool, ServerModule } from "./types";

// The modules of the app (server part), in the order of the app shell part (registry.ts)
const serverModules: Record<string, ServerModule> = { [todosModuleId]: todosServerModule, [notesModuleId]: notesServerModule };

// Navigation data of all modules by module id, loaded by the app layout (src/routes/_app.tsx), read by the modules with useNavigationData
export async function loadNavigationData(userId: string) {
    const entries = await Promise.all(
        Object.entries(serverModules).map(async ([id, module]) => [id, await module.loadNavigation?.(userId)] as const),
    );
    return Object.fromEntries(entries);
}

// The tools of all modules for the AI assistants, scoped to the user
export function createTools(userId: string): Record<string, AppTool> {
    const tools: Record<string, AppTool> = {};
    for (const module of Object.values(serverModules)) {
        for (const [name, tool] of Object.entries(module.createTools(userId))) {
            if (Object.hasOwn(tools, name)) {
                throw new Error(`Tool ${name} is defined by more than one module`);
            }
            tools[name] = tool;
        }
    }
    return tools;
}

export const toolsInstructions = Object.values(serverModules).flatMap((module) => module.instructions);

// What the user is looking at in the app, for the chat assistant
export async function getChatContext(userId: string, page: ChatPage | undefined) {
    const contexts = await Promise.all(Object.values(serverModules).map((module) => module.chatContext?.(userId, page) ?? []));
    return contexts.flat();
}
