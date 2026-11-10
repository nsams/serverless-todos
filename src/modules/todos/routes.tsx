import { useMutation } from "@tanstack/react-query";

import { CollectionIndex } from "~/collections";
import { validateGridSearch } from "~/gridSearch";
import { defineRoute } from "~/routing";

import { todosApi } from "./api";

// The module's routes (mounted in module.ts)

// The user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts)
export const listsRoute = defineRoute({
    path: "/lists",
    Component: function ListsIndex() {
        const getDefaultList = useMutation(todosApi.getDefaultList.mutationOptions());
        return (
            <CollectionIndex
                collections={todosApi.listLists.queryOptions({})}
                createDefault={() => getDefaultList.mutateAsync({})}
                href={(listId) => listRoute.href({ listId })}
            />
        );
    },
});

// The todos of a list (pages/list.tsx). The grid state (pagination, sorting, filtering) lives in the URL.
export const listRoute = defineRoute({
    path: "/lists/:listId",
    validateSearch: validateGridSearch,
    query: ({ params: { listId }, search }) => todosApi.listTodos.queryOptions({ listId, ...search }),
    page: () => import("./pages/list"),
});
