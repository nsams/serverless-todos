import { createFileRoute, redirect } from "@tanstack/react-router";

import { api } from "~/api/client";

// /notes: the user's first notebook (created if the user has none yet). In beforeLoad (runs before the loaders, e.g. the app layout's):
// the layout's loader only runs for the notebook's page.
export const Route = createFileRoute("/_app/notes/")({
    beforeLoad: async () => {
        // a mutation: it may create a notebook
        const { id } = await api.notebooks.getDefault.mutate();
        throw redirect({ to: "/notes/$notebookId", params: { notebookId: id }, replace: true });
    },
});
