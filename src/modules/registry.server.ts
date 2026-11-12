import type { ChatPage } from "~/chat/chatPage";
import { type OperationContext, toolsFromOperations } from "~/operations";

import type { AppTool, ServerModule } from "./types";

// The modules of the app (server part): the `serverModule` export of every src/modules/<module>/module.server.ts, so a new module
// needs no entry here. App shell part: registry.ts.
export const serverModules = Object.entries(
    import.meta.glob<ServerModule | undefined>("./*/module.server.ts", { eager: true, import: "serverModule" }),
).map(([path, module]) => {
    if (!module) {
        throw new Error(`${path} doesn't export serverModule`);
    }
    return module;
});

// The tools of all modules for the AI assistants (the operations with AI metadata), scoped to the user (ctx: the user and the assistant)
export function createTools(ctx: OperationContext): Record<string, AppTool> {
    const tools: Record<string, AppTool> = {};
    for (const module of serverModules) {
        for (const [name, tool] of Object.entries(toolsFromOperations(module.id, module.operations, ctx))) {
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
