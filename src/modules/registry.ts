import { notesModule } from "./notes/module";
import { todosModule } from "./todos/module";
import { listsRoute } from "./todos/routes";
import type { AppModule } from "./types";

// The modules of the app (app shell part: pages, navigation, chat), in the order of the sidebar: the only list of modules (the server
// part (registry.server.ts) is found by the modules' folders)
export const appModules: AppModule[] = [todosModule, notesModule];

// The start page ("/") redirects here
export const startPath = listsRoute.href();
