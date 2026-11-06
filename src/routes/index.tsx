import { createFileRoute, redirect } from "@tanstack/react-router";

import { getDefaultList } from "~/lists.functions";

// Start page: the user's first list (created if the user has none yet)
export const Route = createFileRoute("/")({
    loader: async () => {
        const { id } = await getDefaultList();
        throw redirect({ to: "/lists/$listId", params: { listId: id }, replace: true });
    },
});
