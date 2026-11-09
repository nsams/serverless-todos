import { createFileRoute, redirect } from "@tanstack/react-router";

import { api } from "~/api/client";

// /lists: the user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts).
// In beforeLoad (runs before the loaders, e.g. the app layout's): the layout's loader only runs for the list's page.
export const Route = createFileRoute("/_app/lists/")({
    beforeLoad: async () => {
        // a mutation: it may create a list
        const { id } = await api.lists.getDefault.mutate();
        throw redirect({ to: "/lists/$listId", params: { listId: id }, replace: true });
    },
});
