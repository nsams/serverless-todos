import { relative } from "@react-router/dev/routes";

// The routes of the module (paths of the route modules relative to this folder), mounted into the app layout by src/routes.ts
const { index, prefix, route } = relative(import.meta.dirname);

export default prefix("notes", [
    // redirects to the user's first notebook
    index("routes/notes.index.tsx"),
    route(":notebookId", "routes/notes.$notebookId.index.tsx"),
    route(":notebookId/:noteId", "routes/notes.$notebookId.$noteId.tsx"),
]);
