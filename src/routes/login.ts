import { createFileRoute } from "@tanstack/react-router";

import { login } from "~/auth.server";

export const Route = createFileRoute("/login")({
    server: {
        handlers: {
            GET: ({ request }) => login(request),
        },
    },
});
