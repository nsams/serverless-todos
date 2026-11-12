import { parseResponse } from "hono/client";
import { replace } from "react-router";

import { defineRoute, redirectToLastPageWithRows } from "~/client/routing";
import { validateGridSearch } from "~/gridSearch";

import { todosClient } from "./api";

// The module's pages (src/client/routing.ts): paths, search params and loaders, for the links (href) and the pages (pages/).
// The route objects are in module.ts.

// The todos of a list in a grid (pagination, sorting, filtering on the server, state in the URL)
export const listRoute = defineRoute({
    path: "/lists/:listId",
    validateSearch: validateGridSearch,
    loader: async ({ params: { listId }, search, href }) => {
        const result = await parseResponse(todosClient.lists[":listId"].todos.$get({ param: { listId }, query: search }));
        // e.g. after deleting the last todo of the last page
        redirectToLastPageWithRows(search, { rowsOnPage: result.todos.length, totalCount: result.totalCount }, (lastPage) =>
            href({ listId }, lastPage),
        );
        return result;
    },
});

// A todo's detail page (a form). The search params are the state of the list's grid, kept for the back link. Deliberately no redirect
// when the todo is in another list than the URL's (like the note page has): it would end a "save and leave" of the unsaved changes
// dialog (the reload after saving would redirect instead of leaving to the blocked target).
export const todoRoute = defineRoute({
    path: "/lists/:listId/:todoId",
    validateSearch: validateGridSearch,
    loader: ({ params: { todoId } }) => parseResponse(todosClient.todos[":id"].$get({ param: { id: todoId } })),
});

// The user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts)
export const listsRoute = defineRoute({
    path: "/lists",
    loader: async () => {
        const list = await parseResponse(todosClient.lists.default.$post());
        throw replace(listRoute.href({ listId: list.id }));
    },
});
