import type { ChatPage } from "~/chat/chatPage";
import { toolsFromOperations } from "~/operations";

import type { AppTool, ServerModule } from "./types";

// The modules of the app (server part): the `serverModule` export of every src/modules/<module>/module.server.ts, so a new module
// needs no entry here. App shell part: registry.ts.
const serverModules = Object.entries(import.meta.glob<ServerModule | undefined>("./*/module.server.ts", { eager: true, import: "serverModule" })).map(
    ([path, module]) => {
        if (!module) {
            throw new Error(`${path} doesn't export serverModule`);
        }
        return module;
    },
);

// The API routers of the modules by module id: mounted under the module's id (src/api/router.server.ts), so each module's client
// (e.g. src/modules/todos/api.ts) is typed by its own router only
export const moduleRouters = Object.fromEntries(serverModules.flatMap((module) => (module.api ? [[module.id, module.api]] : [])));

for (const [index, module] of serverModules.entries()) {
    if (serverModules.findIndex((other) => other.id === module.id) !== index) {
        throw new Error(`Module id ${module.id} is used by more than one module`);
    }
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
