import { index, prefix, route } from "@react-router/dev/routes";

// The routes of the module, mounted into the app layout by src/routes.ts (paths of the route modules are relative to src/)
const dir = "modules/todos/routes";

export const todosRoutes = prefix("lists", [
    // redirects to the user's first list
    index(`${dir}/lists.index.tsx`),
    route(":listId", `${dir}/lists.$listId.tsx`),
]);
