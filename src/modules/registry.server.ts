import type { ChatPage } from "~/chat/chatPage";
import { type OperationContext, toolsFromOperations } from "~/operations";

import type { AppTool, ServerModule } from "./types";

// The modules of the app (server part): the default export of every src/modules/<module>/module.server.ts, so a new module is picked up.
// App shell part: registry.ts.
const serverModules = Object.entries(import.meta.glob<ServerModule>("./*/module.server.ts", { eager: true, import: "default" })).map(
    ([path, module]) => {
        // the module's folder is its id, e.g. in the URLs of the operations' API route (src/routes/api.ts)
        if (path !== `./${module.id}/module.server.ts`) {
            throw new Error(`The server module ${path} has the id "${module.id}", expected its folder name`);
        }
        return module;
    },
);

// An operation of a module, e.g. for the operations' API route (src/routes/api.ts); undefined if there is none with these names
export function findOperation(moduleId: string, name: string) {
    const operations = serverModules.find((module) => module.id === moduleId)?.operations;
    return operations && Object.hasOwn(operations, name) ? operations[name] : undefined;
}

// Navigation data of all modules by module id, loaded by the app layout (src/routes/_app.tsx), read by the modules with useNavigationData
export async function loadNavigationData(ctx: OperationContext): Promise<Record<string, unknown>> {
    const entries = await Promise.all(serverModules.map(async ({ id, navigation }) => [id, await navigation?.(ctx)] as const));
    return Object.fromEntries(entries);
}

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
