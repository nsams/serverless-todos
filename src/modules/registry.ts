import { href } from "react-router";

import { notesModule } from "./notes/module";
import { todosModule } from "./todos/module";
import type { AppModule } from "./types";

// The modules of the app (app shell part), in the order of the sidebar: the only place where a new module is added (its server part
// and its routes are picked up from its folder by registry.server.ts and src/routes.ts)
export const appModules: AppModule[] = [todosModule, notesModule];

// The start page ("/") redirects here
export const startPath = href("/lists");
