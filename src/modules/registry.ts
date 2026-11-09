import { notesModule } from "./notes/module";
import { todosModule } from "./todos/module";
import type { AppModule } from "./types";

// The modules of the app (app shell part: pages, navigation, chat). Server part: registry.server.ts.
export const appModules: AppModule[] = [todosModule, notesModule];

// The start page ("/") redirects here
export const startPath = "/lists";
