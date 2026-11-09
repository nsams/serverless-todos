import { index, layout, physical, rootRoute } from "@tanstack/virtual-file-routes";

// Route tree (TanStack Router virtual file routes, see vite.config.ts): the core routes in src/routes/, the routes of each module
// in its own folder src/modules/<module>/routes/ (file-based routing within the folder), mounted into the app layout.
// Paths are relative to src/routes/.
export const routes = rootRoute("__root.tsx", [
    index("index.tsx"),
    layout("_app.tsx", [
        // src/modules/todos/routes/: /lists, /lists/$listId
        physical("../modules/todos/routes"),
        // src/modules/notes/routes/: /notes, /notes/$notebookId, /notes/$notebookId/$noteId
        physical("../modules/notes/routes"),
    ]),
]);
