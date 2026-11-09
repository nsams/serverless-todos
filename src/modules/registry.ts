import { notesModule } from "./notes/module";
import { todosModule } from "./todos/module";
import type { AppModule } from "./types";

// The modules of the app (app shell part). Server part: registry.server.ts.
export const appModules: AppModule[] = [todosModule, notesModule];

// The start page ("/") redirects here
export const startPath = "/lists";

// Navigation data of all modules by module id, loaded by the app layout (src/routes/app.tsx), read by the modules with useNavigationData
export async function loadNavigationData() {
    const entries = await Promise.all(
        appModules.map(async ({ id, navigation }) => [id, navigation ? await navigation.loader() : undefined] as const),
    );
    return Object.fromEntries(entries);
}
