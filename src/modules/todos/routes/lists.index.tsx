import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseResponse } from "hono/client";

import { defaultCollectionId } from "~/collections";

import { todosClient } from "../api";
import { listsQuery } from "../queries";

// The user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts)
export const Route = createFileRoute("/_app/lists/")({
    loader: async ({ context: { queryClient }, preload }) => {
        const listId = await defaultCollectionId(queryClient, {
            collectionsQuery: listsQuery,
            createDefault: () => parseResponse(todosClient.lists.default.$post()),
            preload,
        });
        if (listId) {
            throw redirect({ to: "/lists/$listId", params: { listId }, replace: true });
        }
    },
});
