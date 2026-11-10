import { createFileRoute, redirect } from "@tanstack/react-router";

import { defaultCollectionId } from "~/collections";

import { todosApi } from "../api";

// The user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts)
export const Route = createFileRoute("/_app/lists/")({
    loader: async ({ context: { queryClient }, preload }) => {
        const listId = await defaultCollectionId(queryClient, {
            collectionsQuery: todosApi.listLists.queryOptions({}),
            createDefault: () => todosApi.getDefaultList.mutate({}),
            preload,
        });
        if (listId) {
            throw redirect({ to: "/lists/$listId", params: { listId }, replace: true });
        }
    },
});
