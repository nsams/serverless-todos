import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseResponse } from "hono/client";

import { api } from "~/api/client";

// The user's first notebook (created if the user has none yet)
export const Route = createFileRoute("/_app/notes/")({
    loader: async () => {
        const { id } = await parseResponse(api.notebooks.default.$post());
        throw redirect({ to: "/notes/$notebookId", params: { notebookId: id }, replace: true });
    },
});
