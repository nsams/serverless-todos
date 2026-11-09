import { index, prefix, route } from "@react-router/dev/routes";

import { notebookRouteId, noteRouteId } from "./routeIds";

// The routes of the module, mounted into the app layout by src/routes.ts (paths of the route modules are relative to src/)
const dir = "modules/notes/routes";

export const notesRoutes = prefix("notes", [
    // redirects to the user's first notebook
    index(`${dir}/notes.index.tsx`, { id: "notes/notebooks" }),
    route(":notebookId", `${dir}/notes.$notebookId.index.tsx`, { id: notebookRouteId }),
    route(":notebookId/:noteId", `${dir}/notes.$notebookId.$noteId.tsx`, { id: noteRouteId }),
]);
