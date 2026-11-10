import { notesModule } from "./notes/module";
import { todosModule } from "./todos/module";
import type { AppModule } from "./types";

// The modules of the app (app shell part), in the order of the sidebar: the only list of modules (the server part (registry.server.ts)
// and the routes (src/routes.ts) are found by the modules' folders)
export const appModules: AppModule[] = [todosModule, notesModule];

// The start page ("/") redirects here
export const startPath = "/lists";
