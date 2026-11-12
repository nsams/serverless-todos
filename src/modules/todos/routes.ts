import { defineRoute } from "~/client/routing";
import { validateGridSearch } from "~/gridSearch";

// The module's pages (src/client/routing.ts): paths and search params, for the links (href) and the pages (pages/, see module.ts)

// The user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts)
export const listsRoute = defineRoute({ path: "/lists" });

// The todos of a list in a grid (pagination, sorting, filtering on the server, state in the URL)
export const listRoute = defineRoute({ path: "/lists/:listId", validateSearch: validateGridSearch });

// A todo's detail page (a form). The search params are the state of the list's grid, kept for the back link.
export const todoRoute = defineRoute({ path: "/lists/:listId/:todoId", validateSearch: validateGridSearch });
