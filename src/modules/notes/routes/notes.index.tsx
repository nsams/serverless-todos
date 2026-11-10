import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseResponse } from "hono/client";

import { defaultCollectionId } from "~/collections";

import { notesClient } from "../api";
import { notebooksQuery } from "../queries";

// The user's first notebook (created if the user has none yet)
export const Route = createFileRoute("/_app/notes/")({
    loader: async ({ context: { queryClient }, preload }) => {
        const notebookId = await defaultCollectionId(queryClient, {
            collectionsQuery: notebooksQuery,
            createDefault: () => parseResponse(notesClient.notebooks.default.$post()),
            preload,
        });
        if (notebookId) {
            throw redirect({ to: "/notes/$notebookId", params: { notebookId }, replace: true });
        }
    },
});
