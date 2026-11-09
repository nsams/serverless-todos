import { index, layout, type RouteConfig } from "@react-router/dev/routes";

import { notesRoutes } from "./modules/notes/routes";
import { todosRoutes } from "./modules/todos/routes";

// Route config (React Router framework mode): the core routes in src/routes/, the routes of each module in its own folder
// src/modules/<module>/ (route config routes.ts, route modules in routes/), mounted into the app layout. Paths are relative to src/.
export default [
    index("routes/index.tsx"),
    // id: read by useNavigationData (src/modules/navigation.ts)
    layout("routes/_app.tsx", { id: "app" }, [
        // /lists, /lists/:listId
        ...todosRoutes,
        // /notes, /notes/:notebookId, /notes/:notebookId/:noteId
        ...notesRoutes,
    ]),
] satisfies RouteConfig;
