import { relative } from "@react-router/dev/routes";

// The routes of the module (paths of the route modules relative to this folder), mounted into the app layout by src/routes.ts
const { index, prefix, route } = relative(import.meta.dirname);

export default prefix("lists", [
    // redirects to the user's first list
    index("routes/lists.index.tsx"),
    route(":listId", "routes/lists.$listId.tsx"),
]);
