import { createFileRoute } from "@tanstack/react-router";

import { logout } from "~/auth.server";

export const Route = createFileRoute("/logout")({
    server: {
        handlers: {
            POST: ({ request }) => logout(request),
        },
    },
});
