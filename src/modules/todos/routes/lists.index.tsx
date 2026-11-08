import { createFileRoute, redirect } from "@tanstack/react-router";

import { getDefaultList } from "../lists.functions";

// The user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts)
export const Route = createFileRoute("/_app/lists/")({
    loader: async () => {
        const { id } = await getDefaultList();
        throw redirect({ to: "/lists/$listId", params: { listId: id }, replace: true });
    },
});
