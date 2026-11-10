import { replace } from "react-router";

import { defaultCollectionId } from "~/collections";
import { lastPageWithRows, validateGridSearch } from "~/gridSearch";
import { defineRoute } from "~/routing";

import { todosApi } from "./api";
import { parseTodoSearch } from "./todoSearch";

// The module's routes (mounted with their pages in module.ts)

// The user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts)
export const listsRoute = defineRoute({
    path: "/lists",
    loader: async ({ request: { signal } }): Promise<never> => {
        const listId = await defaultCollectionId(todosApi.listLists.query({}, { signal }), () => todosApi.getDefaultList.mutate({}));
        throw replace(listRoute.href({ listId }));
    },
});

// The todos of a list (pages/list.tsx). The grid state (pagination, sorting, filtering) lives in the URL.
export const listRoute = defineRoute({
    path: "/lists/:listId",
    validateSearch: validateGridSearch,
    loader: async ({ params: { listId }, search, request: { signal } }) => {
        const result = await todosApi.listTodos.query({ listId, ...search }, { signal });
        // e.g. after deleting the last todo of the last page
        const lastPage = lastPageWithRows(parseTodoSearch(search), result.todos.length, result.totalCount);
        if (lastPage !== undefined) {
            throw replace(listRoute.href({ listId }, { ...search, page: lastPage || undefined }));
        }
        return result;
    },
});
