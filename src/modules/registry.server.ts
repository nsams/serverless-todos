import { createApi } from "~/api/hono.server";
import type { ChatPage } from "~/chat/chat";

import { notesApi } from "./notes/api.server";
import { notesServerModule } from "./notes/module.server";
import { todosApi } from "./todos/api.server";
import { todosServerModule } from "./todos/module.server";
import type { AppTool, ServerModule } from "./types";

// The modules of the app (server part). App shell part: registry.ts.
const serverModules: ServerModule[] = [todosServerModule, notesServerModule];

// The REST APIs of the modules, mounted at /api (src/api/api.server.ts). Chained (not built in a loop over the modules),
// so the type of the API, and with it the typed client, knows every route.
export const modulesApi = createApi().route("/", todosApi).route("/", notesApi);

// The tools of all modules for the AI assistants, scoped to the user
export function createTools(userId: string): Record<string, AppTool> {
    const tools: Record<string, AppTool> = {};
    for (const module of serverModules) {
        for (const [name, tool] of Object.entries(module.createTools(userId))) {
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
