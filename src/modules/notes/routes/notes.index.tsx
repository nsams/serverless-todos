import { createFileRoute, redirect } from "@tanstack/react-router";

import { getDefaultNotebook } from "../notebooks.functions";

// The user's first notebook (created if the user has none yet)
export const Route = createFileRoute("/_app/notes/")({
    loader: async () => {
        const { id } = await getDefaultNotebook();
        throw redirect({ to: "/notes/$notebookId", params: { notebookId: id }, replace: true });
    },
});
