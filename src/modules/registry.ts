import type { RouterContext } from "~/api/query";

import { notesModule } from "./notes/module";
import { todosModule } from "./todos/module";
import type { AppModule } from "./types";

// The modules of the app (app shell part). Server part: registry.server.ts; routes: src/routes.ts.
export const appModules: AppModule[] = [todosModule, notesModule];

// The start page ("/") redirects here (checked against the route tree by the redirect in src/routes/index.tsx)
export const startPath = "/lists";

// Loads the navigation data of all modules into the query cache, called by the app layout's loader (src/routes/_app.tsx)
export function loadNavigationData(context: RouterContext) {
    return Promise.all(appModules.map(({ navigation }) => navigation?.loader(context)));
}
