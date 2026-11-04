import { createFileRoute } from "@tanstack/react-router";

import { handleCallback } from "~/auth.server";

export const Route = createFileRoute("/auth/callback")({
    server: {
        handlers: {
            GET: ({ request }) => handleCallback(request),
        },
    },
});
