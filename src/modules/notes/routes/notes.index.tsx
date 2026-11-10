import { createFileRoute, redirect } from "@tanstack/react-router";

import { defaultCollectionId } from "~/collections";

import { notesApi } from "../api";

// The user's first notebook (created if the user has none yet)
export const Route = createFileRoute("/_app/notes/")({
    loader: async ({ context: { queryClient }, preload }) => {
        const notebookId = await defaultCollectionId(queryClient, {
            collectionsQuery: notesApi.listNotebooks.queryOptions({}),
            createDefault: () => notesApi.getDefaultNotebook.mutate({}),
            preload,
        });
        if (notebookId) {
            throw redirect({ to: "/notes/$notebookId", params: { notebookId }, replace: true });
        }
    },
});
