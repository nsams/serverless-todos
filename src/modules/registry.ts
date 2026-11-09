import { notesModule } from "./notes/module";
import { todosModule } from "./todos/module";
import { defaultListRoute } from "./todos/paths";
import type { AppModule } from "./types";

// The modules of the app (app shell part). Server part: registry.server.ts.
export const appModules: AppModule[] = [todosModule, notesModule];

// The pages of all modules
export const appPages = appModules.flatMap((module) => module.pages);

// The start page ("/") redirects here
export const startPath = defaultListRoute.href();
