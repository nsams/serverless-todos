import { existsSync, readdirSync } from "node:fs";

import { index, layout, physical, rootRoute, route } from "@tanstack/virtual-file-routes";

// Route tree (TanStack Router virtual file routes, see tsr.config.json): the core routes in src/routes/, the routes of each module
// in its own folder src/modules/<module>/routes/ (file-based routing within the folder), mounted into the app layout.
// The modules' route folders are found by the folder structure, so a new module needs no entry here. Evaluated in Node by the route
// generator (dev, build, lint:tsc); paths are relative to src/routes/.
const modulesDirectory = new URL("modules/", import.meta.url);
const moduleRoutes = readdirSync(modulesDirectory)
    .filter((module) => existsSync(new URL(`${module}/routes`, modulesDirectory)))
    .sort()
    .map((module) => physical(`../modules/${module}/routes`));

// e.g. src/modules/todos/routes/: /lists, /lists/$listId, /lists/$listId/$todoId; src/modules/notes/routes/: /notes, /notes/$notebookId, /notes/$notebookId/$noteId
export const routes = rootRoute("__root.tsx", [
    index("index.tsx"),
    layout("_app.tsx", [
        ...moduleRoutes,
        // any other path: 404 within the app layout
        route("$", "_app.$.tsx"),
    ]),
]);
