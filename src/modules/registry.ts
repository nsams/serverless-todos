import type { QueryClient } from "@tanstack/react-query";

import { notesModule } from "./notes/module";
import { todosModule } from "./todos/module";
import type { AppModule } from "./types";

// The modules of the app (app shell part: navigation, chat). Server part: registry.server.ts; pages: src/client/routes.ts.
export const appModules: AppModule[] = [todosModule, notesModule];

// The start page ("/") redirects here
export const startPath = "/lists";

// Loads the navigation data of all modules into the query cache, called by the app layout's loader (src/client/routes/_app.tsx)
export async function loadNavigationData(queryClient: QueryClient) {
    await Promise.all(appModules.map(({ navigation }) => navigation?.loader(queryClient)));
}
