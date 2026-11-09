import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseResponse } from "hono/client";

import { api } from "~/api/client";

// The user's first list (created if the user has none yet); also the start page of the app (src/modules/registry.ts)
export const Route = createFileRoute("/_app/lists/")({
    loader: async () => {
        const { id } = await parseResponse(api.lists.default.$post());
        throw redirect({ to: "/lists/$listId", params: { listId: id }, replace: true });
    },
});
