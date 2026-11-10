import { notesModule } from "./notes/module";
import { todosModule } from "./todos/module";
import { listsRoute } from "./todos/routes";
import type { AppModule } from "./types";

// The modules of the app (app shell part: pages, navigation, chat). Server part: registry.server.ts.
export const appModules: AppModule[] = [todosModule, notesModule];

// The start page ("/") runs this page's loader, which redirects to the user's first list. Outside the app layout, so the layout's data
// (the user, the navigation) is only loaded for the page it redirects to.
export const startRoute = listsRoute;
