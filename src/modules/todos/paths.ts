import { validateGridSearch } from "~/gridSearch";
import { defineRoute } from "~/routeDefinition";

// The routes of the module's pages (pages.ts): paths, params, search params, route ids; also used by the server (chat context, module.server.ts)

// Route id of a list's page, see ChatPage in src/chat/chat.ts
export const listRouteId = "todos/list";

// redirects to the user's first list
export const defaultListRoute = defineRoute({ path: "/lists" });

// the todos of a list; the grid state (pagination, sorting, filtering) lives in the search params
export const listRoute = defineRoute({ id: listRouteId, path: "/lists/:listId", validateSearch: validateGridSearch });
